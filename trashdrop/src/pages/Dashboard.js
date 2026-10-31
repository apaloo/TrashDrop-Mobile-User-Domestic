import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import appConfig from '../utils/app-config.js';
import { useAuth } from '../context/AuthContext.js';
import supabase from '../utils/supabaseClient.js';
import DashboardOptimizer from '../components/DashboardOptimizer.js';
import OnboardingFlow from '../components/OnboardingFlow.js';
import NavigationChoiceModal from '../components/NavigationChoiceModal.js';
import { userService, pickupService } from '../services/index.js';
import userServiceOptimized from '../services/userServiceOptimized.js';
import { notificationService } from '../services/notificationService.js';
import onboardingService from '../services/onboardingService.js';
import { statusService } from '../services/statusService.js';
import smartNotificationService from '../services/smartNotificationService.js';
import { isOnline, getCachedUserStats, cacheUserStats, cacheUserActivity, getCachedUserActivity } from '../utils/offlineStorage';
import { subscribeToStatsUpdates, subscribeToDumpingReports, handleDumpingReportUpdate, handleStatsUpdate } from '../utils/realtime';
import realtimeManager from '../utils/realtimeOptimized.js';
import seamlessDashboardService from '../services/seamlessDashboardService.js';
import DataFreshnessIndicator from '../components/DataFreshnessIndicator.js';
import { ActivityItemSkeleton } from '../components/SkeletonLoader.js';
import CoverageArrivalBanner from '../components/CoverageArrivalBanner.js';
import RewardsCard from '../components/dashboard/RewardsCard.js';
import ActivityRow from '../components/dashboard/ActivityRow.js';
import LivePickupCard from '../components/dashboard/LivePickupCard.js';
import { reportPoints, reportPointsPending } from '../utils/reportPoints.js';

// For development: expose cleanup function
if (process.env.NODE_ENV === 'development') {
  window.clearOnboardingTestData = (userId) => {
    return onboardingService.clearTestData(userId);
  };
}

// Skeleton component to prevent CLS
const DashboardSkeleton = () => (
  <div className="min-h-screen bg-white dark:bg-gray-900" style={{ minHeight: '100vh' }}>
    <div className="container mx-auto px-4 py-8">
      {/* Stats Cards Skeleton */}
      <div className="mb-6">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex space-x-4 pb-2" style={{ width: 'fit-content' }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex-shrink-0 w-32 h-24 bg-white bg-opacity-10 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
      
      {/* Recent Activity Skeleton */}
      <div className="mb-8">
        <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-2xl p-6">
          <div className="h-6 bg-white bg-opacity-20 rounded mb-4 w-32 animate-pulse" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-100 rounded-lg p-4 flex items-center animate-pulse">
                <div className="w-10 h-10 rounded-full bg-white bg-opacity-20 mr-4" />
                <div className="flex-1">
                  <div className="h-4 bg-white bg-opacity-20 rounded mb-2 w-3/4" />
                  <div className="h-3 bg-white bg-opacity-20 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Placeholder rows for the Recent Activity list while the first fetch is in
// flight - without it the empty state flashes and reads like an error
const ActivityListSkeleton = () => (
  <div role="status" aria-label="Loading recent activity">
    {[1, 2, 3].map(i => (
      <div
        key={i}
        className="py-2.5 border-t border-td-border dark:border-gray-700 first:border-t-0"
        aria-hidden="true"
      >
        <ActivityItemSkeleton />
      </div>
    ))}
    <span className="sr-only">Loading recent activity</span>
  </div>
);

// Backoff schedule for the initial dashboard load, in ms. Length also decides
// how many retries happen before the user sees a failure banner.
const LOAD_RETRY_DELAYS = [500, 1500, 4000];

/**
 * Dashboard page component showing user's activity and nearby trash drop points
 */
const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  console.log('[Dashboard] Dashboard component rendering, user:', user?.id);
  console.log('[Dashboard] Dashboard component - user object:', user);
  
  // Stats state with database table field mappings:
  // points: profiles.points (user profile table)
  // pickups: COUNT(pickup_requests) + COUNT(digital_bins) WHERE user_id = user.id (both requests and digital bins)
  // reports: COUNT(illegal_dumping) WHERE reported_by = user.id  
  // batches: COUNT(bag_inventory) WHERE user_id = user.id (bag batch count)
  // totalBags: SUM(pickup_requests.bag_count) WHERE collector_id = user.id AND status = 'completed'
  const [stats, setStats] = useState({
    points: 0,
    pickups: 0,
    reports: 0,
    batches: 0,
    totalBags: 0,
    available_bags: 0
  });
  const [recentActivities, setRecentActivities] = useState([]); // Always initialize as empty array
  const [activePickups, setActivePickups] = useState([]);
  // Latest active pickups for realtime callbacks, which outlive a render
  const activePickupsRef = useRef(activePickups);
  activePickupsRef.current = activePickups;
  const [isLoading, setIsLoading] = useState(false); // Start with false to improve LCP
  const [isRefreshingActivities, setIsRefreshingActivities] = useState(false); // Track activity refresh state
  const [activitiesLoaded, setActivitiesLoaded] = useState(false); // First activity fetch has settled (success or failure)
  const [isOnlineStatus, setIsOnlineStatus] = useState(isOnline());
  const [dataSource, setDataSource] = useState('seamless'); // 'seamless', 'network', 'loading'
  const [updateType, setUpdateType] = useState('initial'); // Track update type for visual feedback
  const sessionRefreshRef = useRef(null);
  const mountedRef = useRef(true);
  const [bagsPulse, setBagsPulse] = useState(false);
  const bagsPulseTimerRef = useRef(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false); // Initial load exhausted its retries
  const [isRetryingLoad, setIsRetryingLoad] = useState(false);
  const seamlessSubscriptionsRef = useRef({});
  
  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStartingStep, setOnboardingStartingStep] = useState(null);
  const onboardingSetByUrlRef = useRef(false); // Guard: URL-param-triggered onboarding survives re-renders
  const [userOnboardingState, setUserOnboardingState] = useState(null);
  const [nextAction, setNextAction] = useState(null);
  
  // Navigation choice modal state
  const [showNavigationModal, setShowNavigationModal] = useState(false);
  const [navigationPickup, setNavigationPickup] = useState(null);

  // All activity writes go through here so the UI can tell "still loading" apart
  // from "genuinely empty" - accepts a value or an updater, like setState
  const applyRecentActivities = useCallback((activities) => {
    setRecentActivities(activities);
    setActivitiesLoaded(true);
  }, []);
  
  // Check onboarding status and show appropriate UI
  useEffect(() => {
    console.log('[Dashboard] Onboarding useEffect triggered, user.id:', user?.id);
    
    try {
      const checkOnboardingStatus = async () => {
        console.log('[Dashboard] checkOnboardingStatus called, user.id:', user?.id);
      if (!user?.id) {
        console.log('[Dashboard] No user ID, skipping onboarding check');
        return;
      }
      
      try {
        // Check if returning from onboarding location setup
        const urlParams = new URLSearchParams(window.location.search);
        const source = urlParams.get('source');
        const action = urlParams.get('action');
        
        console.log('[Dashboard] Checking URL params - source:', source, 'action:', action, 'full search:', window.location.search);
        
        // If a previous run already set onboarding via URL params, don't override
        if (onboardingSetByUrlRef.current) {
          console.log('[Dashboard] Onboarding already set by URL params, skipping re-check');
          return;
        }
        
        if (source === 'onboarding' && action === 'location-saved') {
          console.log('[Dashboard] Returning from onboarding location setup - reopening onboarding');
          localStorage.setItem('trashdrop_location_saved', 'true');
          setOnboardingStartingStep('scan_qr');
          setShowOnboarding(true);
          onboardingSetByUrlRef.current = true;
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }
        
        if (source === 'onboarding' && action === 'qr-scanned') {
          console.log('[Dashboard] Returning from QR scan - reopening onboarding');
          localStorage.setItem('trashdrop_qr_scanned', 'true');
          // Store batch details so OnboardingFlow can display them
          const qrCode = urlParams.get('qr_code');
          const bagCount = urlParams.get('bag_count');
          if (qrCode) localStorage.setItem('trashdrop_qr_batch_id', qrCode);
          if (bagCount) localStorage.setItem('trashdrop_qr_bag_count', bagCount);
          setOnboardingStartingStep('scan_result');
          setShowOnboarding(true);
          onboardingSetByUrlRef.current = true;
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }
        
        // Check if user should see onboarding (consolidated — 2 RPCs instead of 4)
        console.log('[Dashboard] Checking onboarding for user:', user.id);
        
        try {
          const onboardingResult = await onboardingService.checkOnboardingStatus(user.id);
          console.log('[Dashboard] checkOnboardingStatus result:', JSON.stringify(onboardingResult));
          
          if (onboardingResult.show) {
            setOnboardingStartingStep(onboardingResult.startingStep);
            setShowOnboarding(true);
            console.log('[Dashboard] Showing onboarding at step:', onboardingResult.startingStep);
            return;
          }
        } catch (error) {
          console.error('[Dashboard] Error checking onboarding:', error);
        }
        
        console.log('[Dashboard] Not showing onboarding popup');
        
      } catch (error) {
        console.error('[Dashboard] Error checking onboarding status:', error);
        console.error('[Dashboard] Error details:', error.stack);
      }
    };
    
    checkOnboardingStatus();
    } catch (error) {
      console.error('[Dashboard] Error in onboarding useEffect:', error);
      console.error('[Dashboard] useEffect error details:', error.stack);
    }
    
      }, [user?.id]);

  // Load recent activities from all activity sources (pickup_requests, illegal_dumping_mobile, digital_bins, user_activity)
  const getDatabaseActivities = useCallback(async (limit = 5) => {
    if (!user?.id) return [];
    
    try {
      console.log('[Dashboard] ✅ READING FROM all activity tables for user:', user.id);
      
      // Fetch from all four activity sources in parallel
      const itemsPerTable = Math.ceil(limit / 4);
      
      const [pickupResult, dumpingResult, digitalBinResult, activityResult] = await Promise.allSettled([
        // Pickup requests
        supabase
          .from('pickup_requests')
          .select('id, created_at, estimated_volume, waste_type, status, location, points_earned')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(itemsPerTable),
        
        // Dumping reports
        supabase
          .from('illegal_dumping_mobile')
          .select('id, created_at, waste_type, status, location, severity')
          .eq('reported_by', user.id)
          .order('created_at', { ascending: false })
          .limit(itemsPerTable),
        
        // Digital bins
        supabase
          .from('digital_bins')
          .select('id, created_at, frequency, waste_type, bag_count, is_active, expires_at, bin_locations:location_id(location_name, address)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(itemsPerTable),
        
        // User activities (excluding pickup_request to avoid duplicates)
        supabase
          .from('user_activity')
          .select('id, created_at, activity_type, points_impact')
          .eq('user_id', user.id)
          .neq('activity_type', 'pickup_request')
          .order('created_at', { ascending: false })
          .limit(itemsPerTable)
      ]);
      
      let allActivities = [];
      
      // Process pickup requests
      if (pickupResult.status === 'fulfilled' && pickupResult.value?.data) {
        const pickups = pickupResult.value.data.map(pickup => ({
          id: pickup.id,
          type: 'pickup_request',
          description: `Pickup request for ${pickup.estimated_volume || 1} bag(s) - ${pickup.status}`,
          timestamp: pickup.created_at,
          related_id: pickup.id,
          points: pickup.points_earned || 10, // Show actual earned points or default to 10
          _source: 'pickup_requests'
        }));
        allActivities = [...allActivities, ...pickups];
        console.log(`[Dashboard] ✅ Found ${pickups.length} pickup requests`);
      }
      
      // Process dumping reports
      if (dumpingResult.status === 'fulfilled' && dumpingResult.value?.data) {
        const reports = dumpingResult.value.data.map(report => {
          // high=20, medium=15, low=10, once the report is verified (utils/reportPoints)
          const severity = report.severity || 'medium';
          
          return {
            id: report.id,
            type: 'dumping_report',
            description: `Reported ${report.waste_type || 'illegal dumping'} (${severity} severity)`,
            timestamp: report.created_at,
            related_id: report.id,
            points: reportPoints(report),
            pointsPending: reportPointsPending(report),
            _source: 'illegal_dumping_mobile'
          };
        });
        allActivities = [...allActivities, ...reports];
        console.log(`[Dashboard] ✅ Found ${reports.length} dumping reports`);
      }
      
      // Process digital bins
      if (digitalBinResult.status === 'fulfilled' && digitalBinResult.value?.data) {
        const digitalBins = digitalBinResult.value.data.map(bin => {
          const locationName = bin.bin_locations?.location_name || 'Unknown location';
          const statusText = bin.is_active ? 'active' : 'inactive';
          const isExpired = new Date(bin.expires_at) < new Date();
          const finalStatus = isExpired ? 'expired' : statusText;
          
          return {
            id: bin.id,
            type: 'digital_bin',
            description: `Digital bin (${bin.frequency}) at ${locationName} - ${finalStatus}`,
            timestamp: bin.created_at,
            related_id: bin.id,
            points: 15, // Digital bins earn 15 points for setup
            _source: 'digital_bins'
          };
        });
        allActivities = [...allActivities, ...digitalBins];
        console.log(`[Dashboard] ✅ Found ${digitalBins.length} digital bins`);
      }
      
      // Process user activities
      if (activityResult.status === 'fulfilled' && activityResult.value?.data) {
        const activities = activityResult.value.data.map(activity => {
          // Generate description based on activity_type
          let description = '';
          switch (activity.activity_type) {
            case 'qr_scan':
              description = 'QR Code Scan';
              break;
            case 'reward_redemption':
              description = 'Reward Redeemed';
              break;
            case 'batch_activation':
              description = 'Batch Activated';
              break;
            default:
              description = `${activity.activity_type.replace(/_/g, ' ')} activity`;
          }
          
          return {
            id: activity.id,
            type: activity.activity_type,
            description: description,
            timestamp: activity.created_at,
            related_id: activity.id,
            points: activity.points_impact || 0,
            _source: 'user_activity'
          };
        });
        allActivities = [...allActivities, ...activities];
        console.log(`[Dashboard] ✅ Found ${activities.length} user activities`);
      }
      
      // Sort all activities by timestamp (newest first) and limit results
      allActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const limitedActivities = allActivities.slice(0, limit);
      
      console.log(`[Dashboard] ✅ Returning ${limitedActivities.length} total activities from all sources`);
      return limitedActivities;
      
    } catch (error) {
      console.error('[Dashboard] ❌ Error loading activities from all sources:', error);
      return [];
    }
  }, [user?.id]);

  const mergeRecentActivities = useCallback(async (serverList = [], limit = 5) => {
    // Use the serverList data that was already fetched
    if (Array.isArray(serverList) && serverList.length > 0) {
      console.log('[Dashboard] Using provided server activities:', serverList.length);
      return serverList.slice(0, limit);
    }
    
    // Fallback to direct database query if no serverList provided
    console.log('[Dashboard] No server list provided, fetching from database');
    const dbActivities = await getDatabaseActivities(limit);
    return dbActivities.slice(0, limit);
  }, [getDatabaseActivities]);

  // Cleanup function
  useEffect(() => {
    // Set on mount, not just cleared on unmount: React 18 StrictMode mounts,
    // unmounts and remounts, and the ref survives that cycle - leaving it false
    // meant every mountedRef-guarded fetch result was thrown away in dev
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Progressive loading function with priority-based data fetching
  const loadDashboardDataProgressive = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      console.log('[Dashboard] 🚀 Progressive loading started for user:', user.id);
      
      // Phase 1: Critical stats (LCP optimization) - Load immediately
      console.log('[Dashboard] 📊 Phase 1: Loading critical stats');
      const criticalStatsPromise = userServiceOptimized.getCriticalStats(user.id);
      const criticalStats = await criticalStatsPromise;
      
      if (criticalStats) {
        setStats(criticalStats);
        console.log('[Dashboard] ⚡ Critical stats loaded for instant UI');
      }
      
      // Phase 2: Active pickups (user action items) - Load immediately after stats
      console.log('[Dashboard] 📦 Phase 2: Loading active pickups');
      const activePickupPromise = pickupService.getActivePickup(user.id);
      const activePickup = await activePickupPromise;
      
      if (activePickup?.data) {
        setActivePickups([activePickup.data]);
        console.log('[Dashboard] ✅ Active pickup loaded');
      } else {
        setActivePickups([]);
      }
      
      // Phase 3: Recent activities (deferred loading) - Use requestIdleCallback
      console.log('[Dashboard] 📝 Phase 3: Deferring recent activities loading');
      const loadActivitiesDeferred = () => {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(async () => {
            try {
              console.log('[Dashboard] 📝 Loading recent activities in idle time');
              setIsRefreshingActivities(true);
              const activities = await getDatabaseActivities(5);
              applyRecentActivities(activities);
              setIsRefreshingActivities(false);
              console.log('[Dashboard] ✅ Recent activities loaded');
            } catch (error) {
              console.warn('[Dashboard] Error loading deferred activities:', error);
              setIsRefreshingActivities(false);
              setActivitiesLoaded(true);
            }
          });
        } else {
          // Fallback for browsers without requestIdleCallback
          setTimeout(async () => {
            try {
              console.log('[Dashboard] 📝 Loading recent activities (fallback)');
              setIsRefreshingActivities(true);
              const activities = await getDatabaseActivities(5);
              applyRecentActivities(activities);
              setIsRefreshingActivities(false);
            } catch (error) {
              console.warn('[Dashboard] Error loading fallback activities:', error);
              setIsRefreshingActivities(false);
              setActivitiesLoaded(true);
            }
          }, 100);
        }
      };
      
      loadActivitiesDeferred();
      
      // Phase 4: Background refresh (non-blocking) - Update cache
      if (isOnlineStatus) {
        console.log('[Dashboard] 🔄 Phase 4: Background refresh');
        const backgroundRefresh = async () => {
          try {
            // Use optimized service for complete data
            const completeData = await userServiceOptimized.getDashboardDataOptimized(user.id);
            
            if (completeData?.stats) {
              setStats(prevStats => {
                const hasChanges = JSON.stringify(prevStats) !== JSON.stringify(completeData.stats);
                if (hasChanges) {
                  cacheUserStats(user.id, completeData.stats);
                  return completeData.stats;
                }
                return prevStats;
              });
            }
            
            if (completeData?.activities) {
              applyRecentActivities(completeData.activities);
            }
            
            console.log('[Dashboard] ✅ Background refresh completed');
          } catch (error) {
            console.warn('[Dashboard] Background refresh failed:', error);
          }
        };
        
        // Run background refresh without blocking
        backgroundRefresh();
      }
      
      setIsLoading(false);
      console.log('[Dashboard] 🎉 Progressive loading completed');
      
    } catch (error) {
      console.error('[Dashboard] Error in progressive loading:', error);
      setIsLoading(false);
    }
  }, [user?.id, isOnlineStatus, getDatabaseActivities, applyRecentActivities]);

  // Optimized consolidated real-time subscription
  useEffect(() => {
    if (!user?.id) return;

    console.log('[Dashboard] 🚀 Setting up optimized real-time subscription');
    
    // Prepare callbacks for the consolidated subscription
    const callbacks = {
      // Stats update callback
      prevStats: stats,
      callback: (updatedStats) => {
        setStats(updatedStats);
      },
      
      // Activity update callbacks
      addActivity: (activity) => {
        applyRecentActivities(prev => [activity, ...prev.slice(0, 4)]);
      },
      refreshStats: () => {
        loadDashboardDataProgressive();
      },
      updateActivePickup: (updatedPickup) => {
        // A collector just took the job: the update only carries collector_id,
        // so load the full pickup (collector name, phone) instead of showing "Waiting..."
        const current = activePickupsRef.current?.[0];
        const collectorChanged = current?.id === updatedPickup.id
          && updatedPickup.collector_id
          && current.collector?.id !== updatedPickup.collector_id;
        if (collectorChanged && user?.id) {
          pickupService.getActivePickup(user.id).then(({ data }) => {
            if (mountedRef.current && data?.id === updatedPickup.id) {
              setActivePickups([data]);
            }
          }).catch(err => console.warn('[Dashboard] Could not load collector details:', err));
        }

        setActivePickups(prev => {
          if (!prev || prev.length === 0) return prev;
          if (prev[0].id === updatedPickup.id) {
            return [{
              ...prev[0],
              status: updatedPickup.status,
              collector_id: updatedPickup.collector_id,
              updated_at: updatedPickup.updated_at,
              collected_at: updatedPickup.collected_at
            }];
          }
          return prev;
        });
      },
      handlePickupAccepted: (pickup) => {
        // Use unified status service to check if tracking should be available
        const isTrackingAvailable = statusService.isTrackingAvailable(pickup.status);
        const availableActions = statusService.getAvailableActions(pickup.status);
        
        console.log('[Dashboard] Pickup accepted:', {
          status: pickup.status,
          isTrackingAvailable,
          availableActions,
          pickupId: pickup.id
        });
        
        // Show navigation choice modal instead of forced navigation
        if (availableActions.includes('track')) {
          setNavigationPickup(pickup);
          setShowNavigationModal(true);
          
          // Send smart notification
          smartNotificationService.sendStatusNotification({
            userId: user.id,
            pickupId: pickup.id,
            oldStatus: 'pending',
            newStatus: pickup.status,
            collectorName: pickup.collector?.first_name ? 
              `${pickup.collector.first_name} ${pickup.collector.last_name}` : 
              'Your collector'
          });
        }
      },
      updateNotificationCount: (delta) => {
        setUnreadNotifications(prev => Math.max(0, prev + delta));
      }
    };

    // Set up single optimized subscription
    const cleanup = realtimeManager.setupOptimizedSubscription(
      user.id,
      callbacks,
      callbacks,
      mountedRef
    );

    // Log performance improvement
    console.log('[Dashboard] ✅ Optimized subscription active (1 channel instead of 4+)');
    console.log('[Dashboard] 📊 Real-time stats:', realtimeManager.getStats());

    return () => {
      console.log('[Dashboard] 🧹 Cleaning up optimized subscription');
      cleanup();
    };
  }, [user?.id, stats, loadDashboardDataProgressive, navigate, mountedRef]);

  // Fetch unread notifications count and subscribe to updates
  useEffect(() => {
    if (!user?.id) return;

    const fetchUnreadCount = async () => {
      try {
        const { data } = await notificationService.getUserNotifications(user.id, {
          status: 'unread',
          limit: 100
        });
        setUnreadNotifications(data?.length || 0);
      } catch (err) {
        console.error('[Dashboard] Error fetching unread notifications:', err);
      }
    };

    fetchUnreadCount();

    // Subscribe to real-time notification updates
    const notificationSubscription = supabase
      .channel(`dashboard_notifications_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alerts',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          setUnreadNotifications(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'alerts',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          if (payload.new.status === 'read' && payload.old.status === 'unread') {
            setUnreadNotifications(prev => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationSubscription);
    };
  }, [user?.id]);


  // Optimistic bag updates from scanner
  useEffect(() => {
    if (!user?.id) return;
    const onBagsUpdated = (e) => {
      const { userId, deltaBags } = e?.detail || {};
      if (!userId || userId !== user.id) return;
      const delta = Number(deltaBags);
      if (!Number.isFinite(delta) || delta === 0) return;
      setStats(prev => ({
        ...prev,
        totalBags: Math.max(0, Number(prev.totalBags || 0) + delta)
      }));
      setBagsPulse(true);
      if (bagsPulseTimerRef.current) {
        clearTimeout(bagsPulseTimerRef.current);
      }
      bagsPulseTimerRef.current = setTimeout(() => setBagsPulse(false), 600);
    };
    window.addEventListener('trashdrop:bags-updated', onBagsUpdated);
    return () => window.removeEventListener('trashdrop:bags-updated', onBagsUpdated);
  }, [user?.id]);

  // Seamless data loading with background caching.
  //
  // Each of the three fetches is settled independently so one failing endpoint
  // can't blank out the two that answered, and the whole thing is retried with
  // exponential backoff before the user is told anything went wrong - a flaky
  // mobile connection shouldn't put an error in front of them on first paint.
  const loadDashboardDataSeamless = useCallback(async () => {
    if (!user?.id) return;

    console.log('[Dashboard] 🚀 Seamless data loading started for user:', user.id);
    setUpdateType('initial');
    setIsLoading(true);

    let lastError = null;

    for (let attempt = 0; attempt < LOAD_RETRY_DELAYS.length + 1; attempt++) {
      if (!mountedRef.current) return;

      // Paint each source the moment it lands rather than waiting for the
      // slowest of the three - and settle them independently so one failing
      // endpoint can't blank out the two that answered
      const paintOnArrival = (promise, apply) => promise.then(
        value => {
          if (mountedRef.current) apply(value);
          return { status: 'fulfilled' };
        },
        reason => ({ status: 'rejected', reason })
      );

      const results = await Promise.all([
        paintOnArrival(seamlessDashboardService.getUserStats(user.id), value => setStats(value || {
          points: 0,
          pickups: 0,
          reports: 0,
          batches: 0,
          totalBags: 0,
          available_bags: 0
        })),
        paintOnArrival(seamlessDashboardService.getRecentActivities(user.id, 5),
          value => applyRecentActivities(value || [])),
        paintOnArrival(seamlessDashboardService.getActivePickups(user.id),
          value => setActivePickups(value || []))
      ]);

      if (!mountedRef.current) return;

      const failures = results.filter(result => result.status === 'rejected');

      if (failures.length === 0) {
        setDataSource('seamless');
        setLoadFailed(false);
        setIsLoading(false);
        console.log('[Dashboard] ✅ Seamless data loading complete');
        return;
      }

      lastError = failures[0].reason;
      console.warn(
        `[Dashboard] Seamless load attempt ${attempt + 1} had ${failures.length} failure(s):`,
        lastError?.message || lastError
      );

      const retryDelay = LOAD_RETRY_DELAYS[attempt];
      if (retryDelay === undefined) break;

      // No point spending the backoff schedule with the radio off - the online
      // listener refreshes as soon as the connection is back
      if (!isOnline()) {
        console.log('[Dashboard] Offline, skipping remaining load retries');
        break;
      }

      // Jitter so a batch of clients doesn't retry in lockstep
      const wait = retryDelay + Math.floor(Math.random() * 250);
      console.log(`[Dashboard] ⏳ Retrying dashboard load in ${wait}ms`);
      await new Promise(resolve => setTimeout(resolve, wait));
    }

    if (!mountedRef.current) return;

    console.error('[Dashboard] ❌ Seamless data loading failed after retries:', lastError);
    setIsLoading(false);
    setDataSource('error');
    setActivitiesLoaded(true);
    setLoadFailed(true);
  }, [user?.id, applyRecentActivities]);

  // Explicit "Try again" from the failure banner
  const handleRetryInitialLoad = useCallback(async () => {
    if (isRetryingLoad) return;
    setIsRetryingLoad(true);
    setLoadFailed(false);
    try {
      await loadDashboardDataSeamless();
    } finally {
      if (mountedRef.current) setIsRetryingLoad(false);
    }
  }, [isRetryingLoad, loadDashboardDataSeamless]);

  // Setup seamless subscriptions for real-time updates
  useEffect(() => {
    if (!user?.id) return;

    console.log('[Dashboard] 🚀 Setting up seamless subscriptions');

    const callbacks = {
      onStatsUpdate: (data, type) => {
        if (!mountedRef.current) return;
        
        console.log(`[Dashboard] 📊 Stats update received: ${type}`);
        setStats(data);
        setUpdateType(type);
        
        // Clear update type after a short delay
        setTimeout(() => setUpdateType('stable'), 1000);
      },
      onActivitiesUpdate: (data, type) => {
        if (!mountedRef.current) return;
        
        console.log(`[Dashboard] 📝 Activities update received: ${type}`);
        applyRecentActivities(data);
        setUpdateType(type);
        
        // Clear update type after a short delay
        setTimeout(() => setUpdateType('stable'), 1000);
      },
      onPickupsUpdate: (data, type) => {
        if (!mountedRef.current) return;
        
        console.log(`[Dashboard] 📦 Pickups update received: ${type}`);
        setActivePickups(data);
        setUpdateType(type);
        
        // Clear update type after a short delay
        setTimeout(() => setUpdateType('stable'), 1000);
      }
    };

    // Subscribe to seamless updates
    const subscriptions = seamlessDashboardService.subscribeToUpdates(user.id, callbacks);
    seamlessSubscriptionsRef.current = subscriptions;

    return () => {
      console.log('[Dashboard] 🧹 Cleaning up seamless subscriptions');
      Object.values(subscriptions).forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      });
    };
  }, [user?.id]);

  // Preload data in background for faster navigation
  useEffect(() => {
    if (!user?.id) return;

    // Preload dashboard data after initial load
    const preloadTimeout = setTimeout(() => {
      seamlessDashboardService.preloadDashboardData(user.id);
    }, 2000);

    return () => clearTimeout(preloadTimeout);
  }, [user?.id]);

  // Online status listener with seamless cache refresh
  useEffect(() => {
    const handleOnlineStatusChange = () => {
      const online = isOnline();
      setIsOnlineStatus(online);
      
      if (online && user?.id) {
        console.log('[Dashboard] 🌐 Back online, refreshing seamless cache');
        // Refresh data when coming back online. The browser fires 'online' as
        // soon as it has a link, which can be before the API is reachable, so
        // swallow the failure here - whatever is already rendered stays put.
        seamlessDashboardService.forceRefresh(user.id)
          .then(() => {
            if (mountedRef.current) {
              setLoadFailed(false);
              setDataSource('seamless');
            }
          })
          .catch(error => {
            console.warn('[Dashboard] Reconnect refresh failed, keeping cached data:', error.message);
          });
      }
    };

    window.addEventListener('online', handleOnlineStatusChange);
    window.addEventListener('offline', handleOnlineStatusChange);

    return () => {
      window.removeEventListener('online', handleOnlineStatusChange);
      window.removeEventListener('offline', handleOnlineStatusChange);
    };
  }, [user?.id]);

  // Manual refresh with seamless caching
  const handleManualRefresh = useCallback(async () => {
    if (!user?.id) return;
    
    if (!isOnlineStatus) {
      console.log('[Dashboard] Cannot refresh while offline');
      return;
    }
    
    console.log('[Dashboard] 🔄 Manual seamless refresh');
    setUpdateType('manual');
    
    try {
      await seamlessDashboardService.forceRefresh(user.id);
      setLoadFailed(false);
      setUpdateType('refreshed');
      
      // Clear update type after delay
      setTimeout(() => setUpdateType('stable'), 1000);
    } catch (error) {
      console.error('[Dashboard] Manual refresh failed:', error);
      setUpdateType('error');
      setTimeout(() => setUpdateType('stable'), 1000);
    }
  }, [user?.id, isOnlineStatus]);

  // Initial data load using seamless approach
  useEffect(() => {
    if (!user?.id) return;

    const initialLoadTimeout = setTimeout(() => {
      loadDashboardDataSeamless();
    }, 100); // Faster initial load with seamless caching

    // Failsafe: never leave the activity skeleton up indefinitely if a fetch hangs
    const skeletonFailsafe = setTimeout(() => {
      if (mountedRef.current) setActivitiesLoaded(true);
    }, 10000);

    return () => {
      clearTimeout(initialLoadTimeout);
      clearTimeout(skeletonFailsafe);
    };
  }, [user?.id, loadDashboardDataSeamless]);

  // Optimized session refresh function with caching
  const getValidSession = useCallback(async () => {
    // Return cached result if still valid
    if (sessionRefreshRef.current && 
        sessionRefreshRef.current.timestamp > Date.now() - 300000) { // 5 minutes cache
      return sessionRefreshRef.current.result;
    }

    try {
      const { data, error } = await supabase.auth.refreshSession();
      const result = error ? 
        { success: true, noSession: true, error } : 
        { success: true, session: data.session };
      
      sessionRefreshRef.current = { result, timestamp: Date.now() };
      return result;
    } catch (err) {
      const result = { success: true, noSession: true, error: err };
      sessionRefreshRef.current = { result, timestamp: Date.now() };
      return result;
    }
  }, [user]);

  // Optimized user stats loading with cache-first approach and stale-while-revalidate
  const loadUserStats = useCallback(async () => {
    if (!user?.id) return;

    try {
      console.log('[Dashboard] 🚀 Smart cache-first loading for user:', user.id);
      
      // 1. Show cached data immediately for instant UI
      const cachedStats = await getCachedUserStats(user.id);
      if (cachedStats && Object.keys(cachedStats).length > 0) {
        console.log('[Dashboard] ⚡ Using cached stats for instant UI');
        setStats(cachedStats);
        setDataSource('cache');
        setIsLoading(false);
      }
      
      // 2. Background refresh with 30s stale window
      const cacheAge = Date.now() - (cachedStats?.cached_at || 0);
      const shouldRefresh = !cachedStats || cacheAge > 30000; // 30 seconds
      
      if (shouldRefresh && isOnlineStatus) {
        console.log('[Dashboard] 🔄 Background refresh needed, cache age:', Math.round(cacheAge/1000), 'seconds');
        
        try {
          const freshStats = await userService.getUserStats(user.id);
          if (freshStats?.data) {
            console.log('[Dashboard] ✅ Fresh stats loaded, updating UI');
            const statsData = freshStats.data;
            
            // Only update if there are actual changes to avoid re-renders
            const hasChanges = JSON.stringify(statsData) !== JSON.stringify(cachedStats);
            if (hasChanges) {
              setStats(statsData);
              cacheUserStats(user.id, statsData); // Update cache in background
              setDataSource('network');
              console.log('[Dashboard] 📊 Stats updated with fresh data');
            } else {
              console.log('[Dashboard] 📊 No changes detected, keeping cache');
            }
          }
        } catch (networkError) {
          console.warn('[Dashboard] Network refresh failed, keeping cache:', networkError);
          // Keep cached data, no error state for user
        }
      } else {
        console.log('[Dashboard] 📊 Cache is fresh, no refresh needed');
        setIsLoading(false);
      }

    } catch (error) {
      console.error('[Dashboard] Error in smart stats loading:', error);
      setIsLoading(false);
    }
  }, [user?.id, isOnlineStatus]);


  // Periodic refresh only. The initial load is loadDashboardDataSeamless's job -
  // running the progressive pass on mount as well fetched the same stats,
  // activities and pickups a second time on every visit.
  useEffect(() => {
    const autoRefreshInterval = setInterval(() => {
      if (isOnlineStatus && mountedRef.current) {
        console.log('[Dashboard] Auto-refreshing data...');
        loadDashboardDataProgressive();
      }
    }, 30000); // Auto-refresh every 30 seconds when online
    
    return () => clearInterval(autoRefreshInterval);
  }, [loadDashboardDataProgressive, isOnlineStatus]);

  // Handle local activity updates with seamless optimistic updates
  useEffect(() => {
    const handleActivityUpdate = async (event) => {
      const { userId, activity } = event.detail || {};
      if (userId === user.id && activity) {
        console.log('[Dashboard] 📝 Local activity detected, updating seamlessly');
        
        // Use optimistic update for instant UI feedback
        try {
          await seamlessDashboardService.optimisticAddActivity(userId, activity);
          
          // If it's a pickup request, also update stats optimistically
          if (activity.activity_type === 'pickup_request') {
            await seamlessDashboardService.optimisticUpdateStats(userId, 'pickup_request', activity);
          }
        } catch (error) {
          console.warn('[Dashboard] Error with optimistic update:', error);
        }
      }
    };
    
    window.addEventListener('trashdrop:activity-updated', handleActivityUpdate);
    
    return () => {
      window.removeEventListener('trashdrop:activity-updated', handleActivityUpdate);
    };
  }, [user?.id]);

  // Cypress test hook to simulate realtime stats updates (test-only)
  useEffect(() => {
    // Only attach in test environment
    if (typeof window === 'undefined') return;
    if (!window.Cypress) return;

    // Expose a helper to emit a stats update payload
    const emitFn = (tableType, payload) => {
      setStats(prev => handleStatsUpdate(tableType || 'user_stats', payload, prev));
    };

    // Namespace under Cypress to avoid globals
    window.Cypress.emitStatsUpdate = emitFn;

    return () => {
      // Cleanup on unmount
      if (window.Cypress && window.Cypress.emitStatsUpdate === emitFn) {
        try { delete window.Cypress.emitStatsUpdate; } catch (_) {}
      }
    };
  }, []);

  // Listen to storage changes from other tabs/windows and refresh
  useEffect(() => {
    const onStorage = (e) => {
      if (!user?.id) return;
      if (e?.key === `userActivity_${user.id}`) {
        const refreshActivities = async () => {
          try {
            const mergedActivities = await mergeRecentActivities([], 5);
            applyRecentActivities(mergedActivities);
          } catch (error) {
            console.warn('[Dashboard] Error refreshing activities from storage:', error);
          }
        };
        refreshActivities();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user?.id, mergeRecentActivities, applyRecentActivities]);

  // Memoized calculations for better performance
  const memoizedStats = useMemo(() => ({
    batchLevel: Math.floor(stats.batches / 2) + 1,
    pickupLevel: Math.floor(stats.pickups / 5) + 1,
    pointsLevel: Math.floor(stats.points / 100) + 1,
    batchProgress: (stats.batches % 2) * 50,
    pickupProgress: (stats.pickups % 5) * 20,
    pointsProgress: stats.points % 100,
    batchesNeeded: 2 - (stats.batches % 2),
    pickupsNeeded: 5 - (stats.pickups % 5),
    pointsNeeded: 100 - (stats.points % 100),
    hasPickupAchievement: stats.pickups >= 5,
    hasPointsAchievement: stats.points >= 250
  }), [stats]);

  const ActivityIcon = ({ type }) => {
    if (type === 'pickup') {
      return (
        <svg className="w-6 h-6 text-td-forest" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      );
    }
    return (
      <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    );
  };

  // Manual refresh function for pull-to-refresh functionality (replaced by seamless version)
  // const handleManualRefresh = useCallback(() => {
  //   // This function is now replaced by handleManualRefresh with seamless caching
  // }, [user?.id, isOnlineStatus]);
  
  // Performance optimization: Only show skeleton if we truly have no data
  // Memoize non-critical UI elements to avoid unnecessary re-renders
  const ActivitySection = useMemo(() => {
    return (
      <div>
          {!activitiesLoaded && (!Array.isArray(recentActivities) || recentActivities.length === 0) ? (
            <ActivityListSkeleton />
          ) : !recentActivities || !Array.isArray(recentActivities) || recentActivities.length === 0 ? (
            <div className="text-center py-6 text-td-sage dark:text-gray-400">
              <p>No recent activities yet</p>
            </div>
          ) : (
            (() => {
              console.log(`[Dashboard] 🎨 RENDERING ${recentActivities.length} activities from all sources`);
              return Array.isArray(recentActivities) && (
                <ul>
                  {recentActivities.map((activity, index) => (
                    <ActivityRow key={activity.id || `activity-${index}`} activity={activity} first={index === 0} />
                  ))}
                </ul>
              );
            })()
          )}
      </div>
    );
  }, [recentActivities, isRefreshingActivities, activitiesLoaded]); // Re-render when activities change, refresh state changes, or the first fetch settles

  // Calculate hasCollectorAssigned for rendering
  const hasCollectorAssigned = activePickups?.length > 0 && activePickups[0]?.status !== 'pending';

  // Early return if user is not loaded yet (after all hooks)
  if (!user?.id) {
    return <DashboardSkeleton />;
  }

  // Handle onboarding completion
  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    // Refresh user state and stats after onboarding
    loadDashboardDataProgressive();
    // Re-check onboarding status
    const checkOnboardingStatus = async () => {
      if (!user?.id) return;
      
      try {
        const shouldShow = await onboardingService.shouldShowOnboarding(user.id);
        if (!shouldShow) {
          const state = await onboardingService.getUserState(user.id);
          setUserOnboardingState(state);
          const action = await onboardingService.getNextAction(user.id);
          setNextAction(action);
        }
      } catch (error) {
        console.error('[Dashboard] Error re-checking onboarding status:', error);
      }
    };
    checkOnboardingStatus();
  };

  // Handle onboarding close
  const handleOnboardingClose = () => {
    setShowOnboarding(false);
  };

  return (
    <div className="bg-white dark:bg-gray-900">
      {/* Data Freshness Indicator */}
      <DataFreshnessIndicator 
        dataSource={dataSource}
        updateType={updateType}
        lastUpdate={Date.now()}
      />
      
      {/* Onboarding Flow */}
      {showOnboarding && (
        <>
          {console.log('[Dashboard] Rendering OnboardingFlow component')}
          <OnboardingFlow 
            onComplete={handleOnboardingComplete}
            onClose={handleOnboardingClose}
            initialStep={onboardingStartingStep}
          />
        </>
      )}
      
      <DashboardOptimizer />
      {/* Top of the dashboard, in the page flow (it used to be pinned at fixed
          offsets): the Rewards card, the bin pickup button, then the totals.
          The top padding leaves room for the floating "Live" indicator. */}
      <div className="max-w-3xl mx-auto px-2 pt-[3.25rem] space-y-4">
        {/* Once a collector has the pickup, it leads the page and the rewards shrink to one row */}
        {hasCollectorAssigned && (
          <LivePickupCard pickup={activePickups[0]} unreadNotifications={unreadNotifications} />
        )}
        <RewardsCard userId={user?.id} fallbackPoints={stats.points} compact={hasCollectorAssigned} />

        <button
          type="button"
          onClick={() => navigate('/digital-bin')}
          className="w-full min-h-[3.5rem] bg-green-600 hover:bg-green-700 text-white text-[17px] font-bold py-4 px-6 rounded-2xl shadow-sm transition-colors duration-200 flex items-center justify-center gap-2.5"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>Request Bin Pickup (No Bag)</span>
        </button>

        <section aria-labelledby="impact-heading">
          <h2 id="impact-heading" className="text-[17px] font-bold text-td-ink dark:text-gray-100 mb-2.5">Your impact</h2>
          {/* The bags tile is never narrower than its one-line label ("bags · 12 batches"), so the label never wraps */}
          <div className="grid grid-cols-[minmax(max-content,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
            <div className="dashboard-card bg-white dark:bg-gray-800 border border-td-border dark:border-gray-700 rounded-2xl px-3.5 py-3">
              <p className={`text-2xl font-bold text-td-ink dark:text-gray-100 ${bagsPulse ? 'animate-pulse' : ''}`}>{stats.totalBags || 0}</p>
              <p className="text-[13px] text-td-sage dark:text-gray-300 mt-0.5 whitespace-nowrap">
                {(stats.totalBags || 0) === 1 ? 'bag' : 'bags'} · {stats.batches || 0} {(stats.batches || 0) === 1 ? 'batch' : 'batches'}
              </p>
            </div>
            <div className="dashboard-card bg-white dark:bg-gray-800 border border-td-border dark:border-gray-700 rounded-2xl px-3.5 py-3">
              <p className={`text-2xl font-bold text-td-ink dark:text-gray-100 ${updateType === 'optimistic' ? 'animate-pulse' : ''}`}>{stats.pickups || 0}</p>
              <p className="text-[13px] text-td-sage dark:text-gray-300 mt-0.5">{(stats.pickups || 0) === 1 ? 'pickup' : 'pickups'}</p>
            </div>
            <div className="dashboard-card bg-white dark:bg-gray-800 border border-td-border dark:border-gray-700 rounded-2xl px-3.5 py-3">
              <p className={`text-2xl font-bold text-td-ink dark:text-gray-100 ${updateType === 'optimistic' ? 'animate-pulse' : ''}`}>{stats.reports || 0}</p>
              <p className="text-[13px] text-td-sage dark:text-gray-300 mt-0.5">{(stats.reports || 0) === 1 ? 'report' : 'reports'}</p>
            </div>
          </div>
        </section>
      </div>

      {/* Onboarding Progress Banner - Show when user needs guidance */}
      {!showOnboarding && nextAction && userOnboardingState?.state !== 'READY_FOR_PICKUP' && (
        <div className="mx-2 sm:mx-auto sm:max-w-3xl mt-4 mb-2 bg-td-tonal dark:bg-gray-800 border border-td-border dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-td-ink dark:text-gray-100 mb-1">
                Complete Your First Cleanup
              </h3>
              <p className="text-td-sage dark:text-gray-300 text-sm">
                Get started in under 60 seconds
              </p>
              <div className="mt-2 space-y-1">
                <div className="flex items-center text-sm">
                  <span className={`w-4 h-4 rounded-full mr-2 ${
                    userOnboardingState?.location_count > 0 ? 'bg-green-500' : 'bg-gray-300'
                  }`}>
                    {userOnboardingState?.location_count > 0 && '✓'}
                  </span>
                  <span className={userOnboardingState?.location_count > 0 ? 'text-green-700 dark:text-green-300 line-through' : 'text-td-ink dark:text-gray-200'}>
                    Set location
                  </span>
                </div>
                <div className="flex items-center text-sm">
                  <span className={`w-4 h-4 rounded-full mr-2 ${
                    userOnboardingState?.total_bags_scanned > 0 ? 'bg-green-500' : 'bg-gray-300'
                  }`}>
                    {userOnboardingState?.total_bags_scanned > 0 && '✓'}
                  </span>
                  <span className={userOnboardingState?.total_bags_scanned > 0 ? 'text-green-700 dark:text-green-300 line-through' : 'text-td-ink dark:text-gray-200'}>
                    Scan QR code or choose service
                  </span>
                </div>
                <div className="flex items-center text-sm">
                  <span className={`w-4 h-4 rounded-full mr-2 ${
                    userOnboardingState?.available_bags > 0 ? 'bg-green-500' : 'bg-gray-300'
                  }`}>
                    {userOnboardingState?.available_bags > 0 && '✓'}
                  </span>
                  <span className={userOnboardingState?.available_bags > 0 ? 'text-green-700 dark:text-green-300 line-through' : 'text-td-ink dark:text-gray-200'}>
                    Request pickup
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <button
                onClick={() => setShowOnboarding(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-semibold"
              >
                {nextAction.title}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scrollable Content - Tab-based: Recent Activity or Active Pickup */}
      <div className="max-w-3xl mx-auto px-2 pt-6 pb-24 space-y-6">
        {/* Initial load gave up after retries - plain language plus a way out,
            never a raw error dump */}
        {loadFailed && (
          <div
            role="alert"
            className="bg-amber-50 dark:bg-amber-900 dark:bg-opacity-20 border border-amber-300 dark:border-amber-700 rounded-lg p-4 flex items-start gap-3"
          >
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                We couldn't load your latest dashboard data
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                {isOnlineStatus
                  ? "Anything shown below may be out of date."
                  : "You're offline - anything shown below may be out of date."}
              </p>
              <button
                type="button"
                onClick={handleRetryInitialLoad}
                disabled={isRetryingLoad}
                className="mt-3 inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {isRetryingLoad ? 'Retrying...' : 'Try again'}
              </button>
            </div>
          </div>
        )}

        {/* "We've arrived" for places the user waitlisted from the location step */}
        <CoverageArrivalBanner />

        {/* Recent Activity */}
        <section aria-labelledby="recent-activity-heading" className="bg-white dark:bg-gray-800 border border-td-border dark:border-gray-700 rounded-2xl px-4 pt-1.5 pb-2">
          <div className="flex items-center justify-between min-h-[3rem]">
            <h2 id="recent-activity-heading" className="text-td-ink dark:text-gray-100 text-[17px] font-bold">Recent Activity</h2>
            <div className="flex items-center gap-3">
              {isRefreshingActivities && (
                <div className="flex items-center text-td-sage text-sm">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                  Updating...
                </div>
              )}
              <Link
                to="/activity"
                className="text-sm text-td-forest dark:text-green-300 hover:text-td-forest-dk underline underline-offset-2"
              >
                View all activity →
              </Link>
            </div>
          </div>
          {ActivitySection}
        </section>

      </div>
      
      {/* Navigation Choice Modal */}
      {showNavigationModal && (
        <NavigationChoiceModal
          pickup={navigationPickup}
          isVisible={showNavigationModal}
          onClose={() => setShowNavigationModal(false)}
          onChoice={(choice) => {
            console.log('[Dashboard] User navigation choice:', choice);
            
            if (choice === 'track') {
              // User chose to track - navigate to tracking page
              navigate(`/collector-tracking?pickupId=${navigationPickup.id}`);
            } else if (choice === 'stay') {
              // User chose to stay - do nothing, just close modal
              console.log('[Dashboard] User chose to stay on dashboard');
            }
            
            setShowNavigationModal(false);
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;
