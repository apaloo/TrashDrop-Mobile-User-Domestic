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
  const [dashboardTab, setDashboardTab] = useState('activity'); // 'activity' | 'pickup'
  const [isLoading, setIsLoading] = useState(false); // Start with false to improve LCP
  const [isRefreshingActivities, setIsRefreshingActivities] = useState(false); // Track activity refresh state
  const [isOnlineStatus, setIsOnlineStatus] = useState(isOnline());
  const [dataSource, setDataSource] = useState('seamless'); // 'seamless', 'network', 'loading'
  const [updateType, setUpdateType] = useState('initial'); // Track update type for visual feedback
  const sessionRefreshRef = useRef(null);
  const mountedRef = useRef(true);
  const [bagsPulse, setBagsPulse] = useState(false);
  const bagsPulseTimerRef = useRef(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const seamlessSubscriptionsRef = useRef({});
  
  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userOnboardingState, setUserOnboardingState] = useState(null);
  const [nextAction, setNextAction] = useState(null);
  
  // Navigation choice modal state
  const [showNavigationModal, setShowNavigationModal] = useState(false);
  const [navigationPickup, setNavigationPickup] = useState(null);
  
  // Check onboarding status and show appropriate UI
  useEffect(() => {
    console.log('[Dashboard] Onboarding useEffect triggered, user.id:', user?.id);
    console.log('[Dashboard] Onboarding useEffect - user exists:', !!user);
    console.log('[Dashboard] Onboarding useEffect - user.id type:', typeof user?.id);
    
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
        
        if (source === 'onboarding' && action === 'location-saved') {
          console.log('[Dashboard] DEBUG: Found location-saved params');
          console.log('[Dashboard] DEBUG: Setting localStorage flag');
          console.log('[Dashboard] Returning from onboarding location setup - reopening onboarding');
          setShowOnboarding(true);
          // Store location saved state to pass to OnboardingFlow
          localStorage.setItem('trashdrop_location_saved', 'true');
          console.log('[Dashboard] DEBUG: localStorage flag set successfully');
          // Clear URL parameters
          window.history.replaceState({}, '', window.location.pathname);
          console.log('[Dashboard] DEBUG: URL params cleared');
          return;
        }
        
        if (source === 'onboarding' && action === 'qr-scanned') {
          console.log('[Dashboard] Returning from QR scan - reopening onboarding');
          
          // Get QR code from URL parameters
          const qrCode = urlParams.get('qr_code');
          console.log('[Dashboard] QR code scanned:', qrCode);
          
          // Process the QR scan through onboarding service
          if (qrCode) {
            try {
              await onboardingService.processQRScan(user.id, qrCode);
              console.log('[Dashboard] QR scan processed successfully');
            } catch (error) {
              console.error('[Dashboard] Error processing QR scan:', error);
            }
          }
          
          setShowOnboarding(true);
          // Clear URL parameters
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }
        
        // Check if user should see onboarding
        console.log('[Dashboard] Checking onboarding for user:', user.id);
        console.log('[Dashboard] onboardingService imported:', !!onboardingService);
        console.log('[Dashboard] shouldShowOnboarding method exists:', !!onboardingService.shouldShowOnboarding);
        
        try {
          const shouldShow = await onboardingService.shouldShowOnboarding(user.id);
          console.log('[Dashboard] shouldShowOnboarding result:', shouldShow);
          
          if (shouldShow) {
            setShowOnboarding(true);
            console.log('[Dashboard] Showing onboarding popup');
            return; // Exit early if showing onboarding
          }
        } catch (error) {
          console.error('[Dashboard] Error checking onboarding:', error);
          console.error('[Dashboard] Error details:', error.stack);
        }
        
        console.log('[Dashboard] Not showing onboarding popup');
        setNextAction(nextAction);
        
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
          .select('id, created_at, bag_count, waste_type, status, location, points_earned')
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
          description: `Pickup request for ${pickup.bag_count || 1} bag(s) - ${pickup.status}`,
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
          // Calculate points based on severity: high=20, medium=15, low=10
          const severity = report.severity || 'medium';
          let points = 15; // default for medium
          if (severity === 'high') points = 20;
          else if (severity === 'low') points = 10;
          
          return {
            id: report.id,
            type: 'dumping_report',
            description: `Reported ${report.waste_type || 'illegal dumping'} (${severity} severity)`,
            timestamp: report.created_at,
            related_id: report.id,
            points: points,
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
              setRecentActivities(activities);
              setIsRefreshingActivities(false);
              console.log('[Dashboard] ✅ Recent activities loaded');
            } catch (error) {
              console.warn('[Dashboard] Error loading deferred activities:', error);
              setIsRefreshingActivities(false);
            }
          });
        } else {
          // Fallback for browsers without requestIdleCallback
          setTimeout(async () => {
            try {
              console.log('[Dashboard] 📝 Loading recent activities (fallback)');
              setIsRefreshingActivities(true);
              const activities = await getDatabaseActivities(5);
              setRecentActivities(activities);
              setIsRefreshingActivities(false);
            } catch (error) {
              console.warn('[Dashboard] Error loading fallback activities:', error);
              setIsRefreshingActivities(false);
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
              setRecentActivities(completeData.activities);
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
  }, [user?.id, isOnlineStatus, getDatabaseActivities]);

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
        setRecentActivities(prev => [activity, ...prev.slice(0, 4)]);
      },
      refreshStats: () => {
        loadDashboardDataProgressive();
      },
      updateActivePickup: (updatedPickup) => {
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

  // Online status listener
  useEffect(() => {
    const handleOnlineStatus = () => {
      setIsOnlineStatus(isOnline());
      if (isOnline() && user?.id) {
        console.log('[Dashboard] Back online, refreshing data');
        loadDashboardDataProgressive();
      }
    };

    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);

    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, [user?.id, loadDashboardDataProgressive]);

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

  // Seamless data loading with background caching
  const loadDashboardDataSeamless = useCallback(async () => {
    if (!user?.id) return;

    try {
      console.log('[Dashboard] 🚀 Seamless data loading started for user:', user.id);
      setUpdateType('initial');
      setIsLoading(true);

      // Load all data using seamless service (no visual data loss)
      const [statsData, activitiesData, pickupsData] = await Promise.all([
        seamlessDashboardService.getUserStats(user.id),
        seamlessDashboardService.getRecentActivities(user.id, 5),
        seamlessDashboardService.getActivePickups(user.id)
      ]);

      if (mountedRef.current) {
        // Update state immediately - data is already cached or fresh
        setStats(statsData || {
          points: 0,
          pickups: 0,
          reports: 0,
          batches: 0,
          totalBags: 0,
          available_bags: 0
        });
        setRecentActivities(activitiesData || []);
        setActivePickups(pickupsData || []);
        setDataSource('seamless');
        setIsLoading(false);
        
        console.log('[Dashboard] ✅ Seamless data loading complete');
      }

    } catch (error) {
      console.error('[Dashboard] ❌ Error in seamless data loading:', error);
      if (mountedRef.current) {
        setIsLoading(false);
        setDataSource('error');
      }
    }
  }, [user?.id]);

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
        setRecentActivities(data);
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
        // Refresh data when coming back online
        seamlessDashboardService.forceRefresh(user.id);
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

    return () => clearTimeout(initialLoadTimeout);
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


  // Call loadDashboardDataProgressive when dependencies change and setup auto-refresh
  useEffect(() => {
    // More aggressive LCP optimization - defer initial load longer
    const initialLoadTimeout = setTimeout(() => {
      loadDashboardDataProgressive();
    }, 500); // Longer delay to ensure LCP is captured first
    
    // Set up auto-refresh interval when online
    const autoRefreshInterval = setInterval(() => {
      if (isOnlineStatus && mountedRef.current) {
        console.log('[Dashboard] Auto-refreshing data...');
        loadDashboardDataProgressive();
      }
    }, 30000); // Auto-refresh every 30 seconds when online
    
    return () => {
      clearTimeout(initialLoadTimeout);
      clearInterval(autoRefreshInterval);
    };
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
            setRecentActivities(mergedActivities);
          } catch (error) {
            console.warn('[Dashboard] Error refreshing activities from storage:', error);
          }
        };
        refreshActivities();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user?.id, mergeRecentActivities]);

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
        <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
      <div className="space-y-3">
          {!recentActivities || !Array.isArray(recentActivities) || recentActivities.length === 0 ? (
            <div className="text-center py-6 text-gray-500 dark:text-gray-400">
              <p>No recent activities yet</p>
            </div>
          ) : (
            (() => {
              console.log(`[Dashboard] 🎨 RENDERING ${recentActivities.length} activities from all sources`);
              return Array.isArray(recentActivities) && recentActivities.map((activity, index) => (
              <div 
                key={activity.id || `activity-${index}`}
                className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4 mb-3 flex items-center"
                loading={index > 2 ? "lazy" : "eager"}
              >
                <div className="flex-shrink-0 mr-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-600 to-blue-500 flex items-center justify-center text-white">
                    {(activity.type === 'pickup' || activity.type === 'pickup_request') && (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" />
                      </svg>
                    )}
                    {(activity.type === 'report' || activity.type === 'dumping_report') && (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    )}
                    {activity.type === 'digital_bin' && (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 3v8a2 2 0 002 2h8a2 2 0 002-2V7H4zm3 2a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                      </svg>
                    )}
                    {(activity.type === 'batch' || activity.type === 'qr_scan') && (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                    )}
                    {activity.type === 'reward_redemption' && (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {!['pickup', 'pickup_request', 'report', 'dumping_report', 'digital_bin', 'batch', 'qr_scan', 'reward_redemption'].includes(activity.type) && (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="flex-grow">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{activity.description || activity.message}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(activity.timestamp).toLocaleString()}
                  </p>
                </div>
                {activity.points > 0 && (
                  <div className="flex-shrink-0 ml-2 bg-green-900 bg-opacity-50 px-2 py-1 rounded text-green-300 text-xs font-semibold">
                    +{activity.points} pts
                  </div>
                )}
              </div>
            ));
            })()
          )}
      </div>
    );
  }, [recentActivities, isRefreshingActivities]); // Re-render when activities change or refresh state changes

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

  // Auto-switch tab based on active pickup state
  const hasCollectorAssigned = activePickups?.length > 0 && activePickups[0].status !== 'pending';
  useEffect(() => {
    if (hasCollectorAssigned) {
      setDashboardTab('pickup');
    } else {
      setDashboardTab('activity');
    }
  }, [hasCollectorAssigned]);

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
          />
        </>
      )}
      
      <DashboardOptimizer />
      {/* Sticky Stats Cards - Horizontal scroll only */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 pt-4 pb-2" style={{position: "fixed", top: "65px", width: "100%"}}>
        <div className="overflow-x-auto scrollbar-hide px-4">
          <div className="flex space-x-4 pb-2" style={{ width: 'fit-content' }}>
              
              {/* Batches & Bags Card */}
              <div className="dashboard-card bg-white dark:bg-gray-800 border-2 border-emerald-400 dark:border-emerald-500 rounded-lg shadow-lg p-6 min-w-[280px] h-32 relative overflow-hidden" fetchpriority="high">
                {/* Decorative Background Icon */}
                <div className="absolute top-2 left-2 opacity-10">
                  <svg className="w-16 h-16 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12,2A3,3 0 0,1 15,5V6H20A1,1 0 0,1 21,7V19A3,3 0 0,1 18,22H6A3,3 0 0,1 3,19V7A1,1 0 0,1 4,6H9V5A3,3 0 0,1 12,2M12,4A1,1 0 0,0 11,5V6H13V5A1,1 0 0,0 12,4M5,8V19A1,1 0 0,0 6,20H18A1,1 0 0,0 19,19V8H5Z" />
                  </svg>
                </div>
                
                {/* Content */}
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <svg className="w-6 h-6 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12,2A3,3 0 0,1 15,5V6H20A1,1 0 0,1 21,7V19A3,3 0 0,1 18,22H6A3,3 0 0,1 3,19V7A1,1 0 0,1 4,6H9V5A3,3 0 0,1 12,2M12,4A1,1 0 0,0 11,5V6H13V5A1,1 0 0,0 12,4M5,8V19A1,1 0 0,0 6,20H18A1,1 0 0,0 19,19V8H5Z" />
                      </svg>
                      <h3 className="text-emerald-700 text-lg font-bold">Batches & Bags</h3>
                    </div>
                    <div className="bg-emerald-100 text-emerald-700 border border-emerald-300 px-3 py-1 rounded-full text-sm font-bold">
                      Lv {Math.floor((stats.points || 0) / 100) + 1}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-around">
                    <div className="text-center">
                      <p className="text-emerald-600 text-xs mb-1">Batches</p>
                      <p className={`text-emerald-700 text-3xl font-bold ${updateType === 'optimistic' ? 'animate-pulse' : ''}`}>
                        {stats.batches || 0}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-emerald-600 text-xs mb-1">Bags</p>
                      <p className={`text-emerald-700 text-3xl font-bold ${bagsPulse ? 'animate-pulse' : ''}`}>
                        {stats.totalBags || 0}
                      </p>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-emerald-100 rounded-full h-2 mb-2">
                    <div 
                      className="bg-emerald-500 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${Math.min(((stats.points || 0) % 100) / 100 * 100, 100)}%` }}
                    ></div>
                  </div>
                  
                  <p className="text-emerald-600 text-sm text-center">
                    {100 - ((stats.points || 0) % 100)} more to level up
                  </p>
                </div>
              </div>
              
              {/* Pickups Card */}
              <div className="dashboard-card bg-white dark:bg-gray-800 border-2 border-teal-400 dark:border-teal-500 rounded-lg shadow-lg p-6 min-w-[280px] h-32 relative overflow-hidden" fetchpriority="high">
                {/* Decorative Background Icon */}
                <div className="absolute top-2 left-2 opacity-10">
                  <svg className="w-16 h-16 text-teal-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19,7H18V6A2,2 0 0,0 16,4H8A2,2 0 0,0 6,6V7H5A1,1 0 0,0 4,8V19A3,3 0 0,0 7,22H17A3,3 0 0,0 20,19V8A1,1 0 0,0 19,7M18,19A1,1 0 0,1 17,20H7A1,1 0 0,1 6,19V9H8V10A1,1 0 0,0 9,11H15A1,1 0 0,0 16,10V9H18V19Z" />
                  </svg>
                </div>
                
                {/* Content */}
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <svg className="w-6 h-6 text-teal-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19,7H18V6A2,2 0 0,0 16,4H8A2,2 0 0,0 6,6V7H5A1,1 0 0,0 4,8V19A3,3 0 0,0 7,22H17A3,3 0 0,0 20,19V8A1,1 0 0,0 19,7M18,19A1,1 0 0,1 17,20H7A1,1 0 0,1 6,19V9H8V10A1,1 0 0,0 9,11H15A1,1 0 0,0 16,10V9H18V19Z" />
                      </svg>
                      <h3 className="text-teal-700 text-lg font-bold">Pickups</h3>
                    </div>
                    <div className="bg-teal-100 text-teal-700 border border-teal-300 px-3 py-1 rounded-full text-sm font-bold">
                      Lv {Math.floor((stats.pickups || 0) / 5) + 1}
                    </div>
                  </div>
                  
                  <div className="text-center mb-4">
                    <p className={`text-teal-700 text-4xl font-bold ${updateType === 'optimistic' ? 'animate-pulse' : ''}`}>
                      {stats.pickups || 0}
                    </p>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-teal-100 rounded-full h-2 mb-2">
                    <div 
                      className="bg-teal-500 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${Math.min(((stats.pickups || 0) % 5) / 5 * 100, 100)}%` }}
                    ></div>
                  </div>
                  
                  <p className="text-teal-600 text-sm text-center">
                    {5 - ((stats.pickups || 0) % 5)} more to level up
                  </p>
                </div>
              </div>

              {/* Reports Card */}
              <div className="dashboard-card bg-white dark:bg-gray-800 border-2 border-amber-400 dark:border-amber-500 rounded-lg shadow-lg p-6 min-w-[280px] h-32 relative overflow-hidden" fetchpriority="high">
                {/* Decorative Background Icon */}
                <div className="absolute top-2 left-2 opacity-10">
                  <svg className="w-16 h-16 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                  </svg>
                </div>
                
                {/* Content */}
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <svg className="w-6 h-6 text-amber-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                      </svg>
                      <h3 className="text-amber-700 text-lg font-bold">Reports</h3>
                    </div>
                    <div className="bg-amber-100 text-amber-700 border border-amber-300 px-3 py-1 rounded-full text-sm font-bold">
                      Lv {Math.floor((stats.reports || 0) / 3) + 1}
                    </div>
                  </div>
                  
                  <div className="text-center mb-4">
                    <p className={`text-amber-700 text-4xl font-bold ${updateType === 'optimistic' ? 'animate-pulse' : ''}`}>
                      {stats.reports || 0}
                    </p>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-amber-100 rounded-full h-2 mb-2">
                    <div 
                      className="bg-amber-500 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${Math.min(((stats.reports || 0) % 3) / 3 * 100, 100)}%` }}
                    ></div>
                  </div>
                  
                  <p className="text-amber-600 text-sm text-center">
                    {3 - ((stats.reports || 0) % 3)} more to level up
                  </p>
                </div>
              </div>
              
            </div>
          </div>
        </div>

      {/* Onboarding Progress Banner - Show when user needs guidance */}
      {!showOnboarding && nextAction && userOnboardingState?.state !== 'READY_FOR_PICKUP' && (
        <div className="mx-4 mt-4 mb-2 bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900 dark:to-green-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-1">
                Complete Your First Cleanup
              </h3>
              <p className="text-blue-700 dark:text-blue-300 text-sm">
                Get started in under 60 seconds
              </p>
              <div className="mt-2 space-y-1">
                <div className="flex items-center text-sm">
                  <span className={`w-4 h-4 rounded-full mr-2 ${
                    userOnboardingState?.location_count > 0 ? 'bg-green-500' : 'bg-gray-300'
                  }`}>
                    {userOnboardingState?.location_count > 0 && '✓'}
                  </span>
                  <span className={userOnboardingState?.location_count > 0 ? 'text-green-700 dark:text-green-300 line-through' : 'text-blue-700 dark:text-blue-300'}>
                    Set location
                  </span>
                </div>
                <div className="flex items-center text-sm">
                  <span className={`w-4 h-4 rounded-full mr-2 ${
                    userOnboardingState?.total_bags_scanned > 0 ? 'bg-green-500' : 'bg-gray-300'
                  }`}>
                    {userOnboardingState?.total_bags_scanned > 0 && '✓'}
                  </span>
                  <span className={userOnboardingState?.total_bags_scanned > 0 ? 'text-green-700 dark:text-green-300 line-through' : 'text-blue-700 dark:text-blue-300'}>
                    Scan QR code or choose service
                  </span>
                </div>
                <div className="flex items-center text-sm">
                  <span className={`w-4 h-4 rounded-full mr-2 ${
                    userOnboardingState?.available_bags > 0 ? 'bg-green-500' : 'bg-gray-300'
                  }`}>
                    {userOnboardingState?.available_bags > 0 && '✓'}
                  </span>
                  <span className={userOnboardingState?.available_bags > 0 ? 'text-green-700 dark:text-green-300 line-through' : 'text-blue-700 dark:text-blue-300'}>
                    Request pickup
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <button
                onClick={() => setShowOnboarding(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold"
              >
                {nextAction.title}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Action Buttons - Sticks below stats cards */}
      <div className="sticky top-[152px] z-10 bg-white dark:bg-gray-900 px-4 pb-4" style={{position: "fixed", top: "230px", width: "96%"}}>
        <div className="grid gap-4">
            {/* Digital Bin Button */}
            <button 
              onClick={() => navigate('/digital-bin')}
              className="w-full bg-white dark:bg-gray-800 border-2 border-blue-300 dark:border-blue-600 hover:border-blue-400 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold py-4 px-6 rounded-lg shadow-lg transition-all duration-200 flex items-center justify-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Digital Bin</span>
            </button>
            
            {/* View Rewards Button */}
            <button 
              onClick={() => navigate('/rewards')}
              className="w-full bg-white dark:bg-gray-800 border-2 border-amber-300 dark:border-amber-600 hover:border-amber-400 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-semibold py-4 px-6 rounded-lg shadow-lg transition-all duration-200 flex items-center justify-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
              <span>View Rewards</span>
            </button>
          </div>
        </div>

      {/* Segmented Control - Only visible when active pickup with collector */}
      {hasCollectorAssigned && (
        <div className="px-4 pb-3" style={{position: "fixed", top: "380px", width: "96%", zIndex: 10, backgroundColor: "inherit"}}>
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-1 flex">
            <button
              onClick={() => setDashboardTab('activity')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-semibold transition-all duration-200 ${
                dashboardTab === 'activity'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Recent Activity
            </button>
            <button
              onClick={() => setDashboardTab('pickup')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                dashboardTab === 'pickup'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Active Pickup
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Scrollable Content - Tab-based: Recent Activity or Active Pickup */}
      <div className="px-4 pb-4 space-y-6" style={{marginTop: hasCollectorAssigned ? "375px" : "325px" }}>
        {/* Recent Activity - shown when activity tab selected or no active pickup */}
        {dashboardTab === 'activity' && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-900 dark:text-gray-100 text-lg font-bold">Recent Activity</h3>
            <div className="flex items-center gap-3">
              {isRefreshingActivities && (
                <div className="flex items-center text-gray-600 text-sm">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                  Updating...
                </div>
              )}
              <Link
                to="/activity"
                className="text-sm text-blue-500 hover:text-blue-600 underline underline-offset-2"
              >
                View all activity →
              </Link>
            </div>
          </div>
          {ActivitySection}
        </div>
        )}

        {/* Active Pickup Card - shown when pickup tab selected */}
        {dashboardTab === 'pickup' && activePickups && activePickups.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden mt-6">
            {/* Card Header */}
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-700/60">
              <h3 className="text-gray-900 dark:text-gray-100 text-base font-bold">
                {activePickups[0].is_digital_bin ? 'Active Digital Bin' : 'Active Pickup'}
              </h3>
              <span 
                className="px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1"
                style={{ 
                  backgroundColor: statusService.getStatusConfig(activePickups[0].status).color + '20', 
                  color: statusService.getStatusConfig(activePickups[0].status).color 
                }}
              >
                {statusService.getStatusIcon(activePickups[0].status)}
                {statusService.getStatusDisplay(activePickups[0].status)}
              </span>
            </div>

            {/* Card Body */}
            <div className="px-5 py-4 space-y-3">
              {/* Row 1: Collector + Bags/Points */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Collector</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {activePickups[0].collector_name || (activePickups[0].collector ? `${activePickups[0].collector.first_name || ''} ${activePickups[0].collector.last_name || ''}`.trim() : null) || 'Waiting...'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  <div className="text-center px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <p className="text-base font-bold text-gray-900 dark:text-gray-100">{activePickups[0].bag_count || activePickups[0].number_of_bags || 0}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Bags</p>
                  </div>
                  <div className="text-center px-3 py-1 bg-green-50 dark:bg-green-900/30 rounded-lg">
                    <p className="text-base font-bold text-green-600 dark:text-green-400">+{activePickups[0].points_earned || activePickups[0].points || 0}</p>
                    <p className="text-[10px] text-green-600 dark:text-green-400 uppercase tracking-wide">Pts</p>
                  </div>
                </div>
              </div>

              {/* Row 2: Location */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Pickup Location</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                    {activePickups[0].location?.address || activePickups[0].location?.location_name || activePickups[0].address || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Digital bin frequency badge */}
              {activePickups[0].is_digital_bin && activePickups[0].frequency && (
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 px-2.5 py-1 rounded-full font-medium">
                    {activePickups[0].frequency}
                  </span>
                </div>
              )}
            </div>
            <div className="px-5 pb-4">
              {/* Action Buttons - Using unified status service */}
              {(() => {
                const availableActions = statusService.getAvailableActions(activePickups[0].status);
                const isTrackingAvailable = statusService.isTrackingAvailable(activePickups[0].status);
                
                if (isTrackingAvailable) {
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      {/* Track Collector Button */}
                      <Link 
                        to={`/collector-tracking?pickupId=${activePickups[0].id}`}
                        className="flex items-center justify-center bg-blue-500 hover:bg-blue-600 rounded-lg p-3 transition-colors cursor-pointer shadow-md"
                      >
                        <div className="flex items-center space-x-2">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="text-white font-medium text-sm">Track Collector</span>
                        </div>
                      </Link>

                      {/* Alerts/Notifications Button */}
                      <Link 
                        to="/notifications" 
                        className="flex items-center justify-center bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-lg p-3 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center space-x-2 relative">
                          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                          <span className="text-blue-700 dark:text-blue-300 font-medium text-sm">Alerts</span>
                          {unreadNotifications > 0 && (
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
                              {unreadNotifications > 9 ? '9+' : unreadNotifications}
                            </span>
                          )}
                        </div>
                      </Link>
                    </div>
                  );
                } else {
                  return (
                    <div className="flex justify-center">
                      <Link 
                        to="/notifications" 
                        className="flex items-center justify-center bg-purple-100 dark:bg-purple-900/40 hover:bg-purple-200 dark:hover:bg-purple-900/60 rounded-lg p-3 transition-colors cursor-pointer w-full"
                      >
                        <div className="flex items-center space-x-2 relative">
                          <svg className="w-6 h-6 text-purple-600 dark:text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                          <span className="text-purple-700 dark:text-purple-300 font-medium">Waiting for Collector... Check Alerts</span>
                          {unreadNotifications > 0 && (
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
                              {unreadNotifications > 9 ? '9+' : unreadNotifications}
                            </span>
                          )}
                        </div>
                      </Link>
                    </div>
                  );
                }
              })()}
            </div>
          </div>
        )}
      </div>
      
      {/* Onboarding Modal */}
      {showOnboarding && (
        <OnboardingFlow
          onComplete={() => {
            console.log('[Dashboard] Onboarding completed');
            setShowOnboarding(false);
          }}
          onClose={() => {
            console.log('[Dashboard] Onboarding closed');
            setShowOnboarding(false);
          }}
        />
      )}
      
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
