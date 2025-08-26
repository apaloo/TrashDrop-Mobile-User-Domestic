import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import appConfig from '../utils/app-config.js';
import { useAuth } from '../context/AuthContext.js';
import DashboardSkeleton from '../components/SkeletonLoader.js';
import ActivePickupCard from '../components/ActivePickupCard.js';
import supabase from '../utils/supabaseClient.js';
import DashboardOptimizer from '../components/DashboardOptimizer.js';
import { userService, activityService, pickupService } from '../services/index.js';
import { 
  cacheUserStats, 
  getCachedUserStats, 
  cacheUserActivity, 
  getCachedUserActivity,
  isOnline 
} from '../utils/offlineStorage.js';
import { subscribeToStatsUpdates, handleStatsUpdate, subscribeToDumpingReports, handleDumpingReportUpdate } from '../utils/realtime.js';

// Lazy-loaded map components removed since map is not currently used in dashboard
// Can be re-enabled when map functionality is needed

/**
 * Dashboard page component showing user's activity and nearby trash drop points
 */
const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Stats state with database table field mappings:
  // points: profiles.points (user profile table)
  // pickups: COUNT(pickup_requests) WHERE collector_id = user.id AND status = 'completed'
  // reports: COUNT(illegal_dumping) WHERE reported_by = user.id  
  // batches: COUNT(bag_inventory) WHERE user_id = user.id (bag batch count)
  // totalBags: SUM(pickup_requests.bag_count) WHERE collector_id = user.id AND status = 'completed'
  const [stats, setStats] = useState(() => {
    // Initialize with cached data if available to improve LCP
    try {
      const cachedStats = getCachedUserStats();
      return cachedStats || {};
    } catch (e) {
      return {};
    }
  });
  const [recentActivities, setRecentActivities] = useState([]); // Always initialize as empty array
  const [activePickups, setActivePickups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnlineStatus, setIsOnlineStatus] = useState(isOnline());
  const [dataSource, setDataSource] = useState(stats.totalBags ? 'cache' : 'loading'); // 'cache', 'network', 'loading'
  const sessionRefreshRef = useRef(null);
  const mountedRef = useRef(true);
  const [bagsPulse, setBagsPulse] = useState(false);
  const bagsPulseTimerRef = useRef(null);
  
  // Helpers: load local user activities and format for dashboard card
  const getLocalActivities = useCallback((limit = 5) => {
    if (!user?.id) return [];
    try {
      const localKey = `userActivity_${user.id}`;
      const localRaw = JSON.parse(localStorage.getItem(localKey) || '[]');
      if (!Array.isArray(localRaw)) return [];
      const formatted = localRaw
        .map(a => ({
          id: a.id,
          type: a.activity_type,
          message: a.details?.description || (a.activity_type === 'dumping_report' ? 'Dumping Report' : 'Activity'),
          timestamp: a.created_at,
          points: a.points_impact || 0,
          isLocal: true,
          sync_status: a.sync_status || 'pending_sync',
          related_id: a.related_id || null,
        }))
        .sort((x, y) => new Date(y.timestamp) - new Date(x.timestamp));
      return typeof limit === 'number' ? formatted.slice(0, limit) : formatted;
    } catch (e) {
      console.warn('[Dashboard] Failed to parse local activities', e);
      return [];
    }
  }, [user?.id]);

  const mergeRecentActivities = useCallback((serverList = [], limit = 5) => {
    const locals = getLocalActivities(limit * 2); // grab extra before dedupe
    const localKeys = new Set(
      locals.filter(a => a.type && a.related_id).map(a => `${a.type}::${a.related_id}`)
    );
    const seenIds = new Set(locals.map(a => a.id));
    const serverFiltered = (serverList || []).filter(item => {
      const key = item.type && item.related_id ? `${item.type}::${item.related_id}` : null;
      if (key && localKeys.has(key)) return false; // prefer local entry
      if (seenIds.has(item.id)) return false;
      return true;
    });
    const combined = [...locals, ...serverFiltered]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return combined.slice(0, limit);
  }, [getLocalActivities]);
  
  // Cleanup function
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  // Optimized Dashboard data loading function with caching and offline support
  const loadDashboardData = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      
      // First check for cached data and display it immediately if available
      const cachedStats = await getCachedUserStats(user.id);
      const cachedActivity = await getCachedUserActivity(user.id);
      
      // Ensure cachedActivity is an array before setting state
      if (cachedActivity && Array.isArray(cachedActivity)) {
        setRecentActivities(cachedActivity);
        console.log('Loaded cached activities:', cachedActivity.length);
      } else {
        console.log('No cached activities found or invalid format');
        setRecentActivities([]);
      }
      
      if (cachedStats && Object.keys(cachedStats).length > 0) {
        setStats(cachedStats);
        setDataSource('cache');
        console.log('Loaded cached stats:', cachedStats);
      }
      
      // If we're online, fetch fresh data in parallel
      if (isOnlineStatus) {
        setDataSource('network');
        
        try {
          // Parallel data fetching for better performance
          const [statsResult, activityResult, pickupsResult] = await Promise.allSettled([
            userService.getUserStats(user.id),
            activityService.getUserActivity(user.id, 5),
            pickupService.getActivePickup(user.id)
          ]);
          
          // Handle stats result
          if (statsResult.status === 'fulfilled' && statsResult.value?.data) {
            const freshStats = statsResult.value.data;
            setStats(freshStats);
            // Cache the fresh stats
            try {
              await cacheUserStats(user.id, freshStats);
            } catch (cacheError) {
              console.warn('Failed to cache fresh stats:', cacheError);
            }
          } else {
            console.warn('Failed to fetch fresh stats:', statsResult.reason);
          }
          
          // Handle activity result
          if (activityResult.status === 'fulfilled' && activityResult.value?.data) {
            const freshActivity = activityResult.value.data;
            const mergedActivity = mergeRecentActivities(freshActivity, 5);
            setRecentActivities(mergedActivity);
            // Cache the fresh activity
            try {
              await cacheUserActivity(user.id, freshActivity);
            } catch (cacheError) {
              console.warn('Failed to cache fresh activity:', cacheError);
            }
          } else {
            console.warn('Failed to fetch fresh activity:', activityResult.reason);
          }
          
          // Handle active pickups result
          if (pickupsResult.status === 'fulfilled' && pickupsResult.value?.data) {
            setActivePickups([pickupsResult.value.data]);
          } else {
            setActivePickups([]);
          }
          
        } catch (networkError) {
          console.error('Network error during data fetch:', networkError);
          // Keep using cached data if network fails
        }
      }
      
    } catch (error) {
      console.error('Error in loadDashboardData:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, isOnlineStatus, mergeRecentActivities]);

  // Set up real-time subscriptions for stats updates
  useEffect(() => {
    if (!user?.id) return;

    console.log('[Dashboard] Setting up real-time stats subscription');
    const statsSubscription = subscribeToStatsUpdates(user.id, (tableType, payload) => {
      if (!mountedRef.current) return;

      console.log(`[Dashboard] Real-time ${tableType} update received`, payload?.new);      
      
      // Detailed logging for batch/bag updates
      if (tableType === 'user_stats' && payload?.new) {
        const newData = payload.new;
        console.log(`[Dashboard] Batch/Bag update: total_batches=${newData.total_batches}, available_bags=${newData.available_bags}, total_bags=${newData.total_bags}`);
      }
      
      // Update stats based on real-time payload
      setStats(prevStats => {
        const updatedStats = handleStatsUpdate(tableType, payload, prevStats);
        
        // Log state changes for debugging
        if (tableType === 'user_stats') {
          console.log('[Dashboard] Stats before update:', {
            batches: prevStats.batches || 0,
            totalBags: prevStats.totalBags || 0,
            available_bags: prevStats.available_bags || 0
          });
          console.log('[Dashboard] Stats after update:', {
            batches: updatedStats.batches || 0,
            totalBags: updatedStats.totalBags || 0,
            available_bags: updatedStats.available_bags || 0
          });
        }
        
        return updatedStats;
      });
      
      // For activity updates, we might need to update the recent activity list
      if (tableType === 'user_activity' && payload.eventType === 'INSERT') {
        setRecentActivities(prev => {
          const newRecord = payload.new;
          if (!newRecord) return prev;
          return [newRecord, ...prev.slice(0, prev.length > 4 ? 4 : prev.length - 1)];
        });
      }
    });

    // Subscribe to dumping reports for real-time stats updates
    const dumpingSubscription = subscribeToDumpingReports(user.id, (payload) => {
      if (!mountedRef.current) return;
      
      handleDumpingReportUpdate(payload, () => {
        // Reload dashboard data to get updated stats
        if (mountedRef.current) {
          loadDashboardData();
        }
      });
    });

    // Subscribe to pickup requests for real-time activity updates
    const pickupSubscription = supabase
      .channel(`pickup_requests_${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'pickup_requests',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        if (!mountedRef.current) return;
        
        console.log('[Dashboard] New pickup request detected:', payload);
        
        // Refresh recent activities to include the new pickup request
        const refreshActivities = async () => {
          try {
            const localActivities = getLocalActivities(5);
            const mergedActivities = mergeRecentActivities([], 5);
            setRecentActivities(mergedActivities);
            
            // Also refresh stats to reflect bag count changes
            loadDashboardData();
          } catch (error) {
            console.warn('[Dashboard] Error refreshing activities after pickup request:', error);
          }
        };
        
        refreshActivities();
      })
      .subscribe();

    return () => {
      try {
        statsSubscription?.unsubscribe?.();
        dumpingSubscription?.unsubscribe?.();
        supabase.removeChannel(pickupSubscription);
      } catch (error) {
        console.warn('[Dashboard] Error unsubscribing from real-time updates:', error);
      }
    };
  }, [user?.id, stats, getLocalActivities, mergeRecentActivities, loadDashboardData]);

  // Online status listener
  useEffect(() => {
    const handleOnlineStatusChange = () => {
      setIsOnlineStatus(isOnline());
    };

    window.addEventListener('online', handleOnlineStatusChange);
    window.addEventListener('offline', handleOnlineStatusChange);

    return () => {
      window.removeEventListener('online', handleOnlineStatusChange);
      window.removeEventListener('offline', handleOnlineStatusChange);
    };
  }, []);

  // Optimized session refresh function with caching
  const getValidSession = useCallback(async () => {
    // Return cached result if still valid
    if (sessionRefreshRef.current && 
        sessionRefreshRef.current.timestamp > Date.now() - 300000) { // 5 minutes cache
      return sessionRefreshRef.current.result;
    }

    // Special cases
    if (user && user.email === 'prince02@mailinator.com') {
      const result = { success: true, testAccount: true };
      sessionRefreshRef.current = { result, timestamp: Date.now() };
      return result;
    }

    if (appConfig?.features?.enableMocks) {
      const result = { success: true, mock: true };
      sessionRefreshRef.current = { result, timestamp: Date.now() };
      return result;
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

  // Optimized user stats loading with parallel requests and prioritized cache
  const loadUserStats = useCallback(async () => {
    try {
      // Start network request immediately but don't wait for it
      let networkPromise;
      if (isOnlineStatus && user?.id) {
        networkPromise = userService.getUserStats(user.id)
          .then(statsData => {
            if (statsData) {
              // Only update UI if it provides new data vs. cache
              cacheUserStats(statsData); // Update cache in background
              setStats(prevStats => {
                // Only update if there are actual changes to avoid re-renders
                const hasChanges = JSON.stringify(prevStats) !== JSON.stringify(statsData);
                if (hasChanges) {
                  return statsData;
                }
                return prevStats;
              });
              setDataSource('network');
              return statsData;
            }
          })
          .catch(err => console.error('Network stats fetch error:', err));
      }
      
      // If we don't already have stats data from initialization
      if (Object.keys(stats).length === 0) {
        try {
          const cachedStats = getCachedUserStats();
          if (cachedStats && Object.keys(cachedStats).length > 0) {
            setStats(cachedStats);
            setDataSource('cache');
          }
        } catch (err) {
          console.warn('Cache read error:', err);
        }
      }

      // Wait for network if we're online, but not too long
      if (networkPromise) {
        // Set a timeout to ensure we don't wait forever
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 2500));
        await Promise.race([networkPromise, timeoutPromise]);
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Error loading user stats:', error);
      setIsLoading(false);
    }
  }, [user?.id, isOnlineStatus, stats]);


  // Call loadDashboardData when dependencies change and setup auto-refresh
  useEffect(() => {
    // Initial load
    loadDashboardData();
    
    // Set up auto-refresh interval when online
    const autoRefreshInterval = setInterval(() => {
      if (isOnlineStatus && mountedRef.current) {
        console.log('[Dashboard] Auto-refreshing data...');
        loadDashboardData();
      }
    }, 30000); // Auto-refresh every 30 seconds when online
    
    return () => {
      clearInterval(autoRefreshInterval);
    };
  }, [loadDashboardData, isOnlineStatus]);

  // Refresh recent activity immediately when a local activity is recorded
  useEffect(() => {
    const handleActivityUpdate = (event) => {
      const { userId, activity } = event.detail || {};
      if (userId === user.id && activity) {
        console.log('[Dashboard] Local activity detected, refreshing recent activities');
        const localActivities = getLocalActivities(5);
        const mergedActivities = mergeRecentActivities([], 5);
        setRecentActivities(mergedActivities);
        
        // If it's a pickup request, also refresh stats to show updated bag count
        if (activity.activity_type === 'pickup_request') {
          console.log('[Dashboard] Pickup request activity detected, refreshing stats');
          loadDashboardData();
        }
      }
    };
    
    window.addEventListener('trashdrop:activity-updated', handleActivityUpdate);
    
    return () => {
      window.removeEventListener('trashdrop:activity-updated', handleActivityUpdate);
    };
  }, [user?.id, getLocalActivities, mergeRecentActivities, loadDashboardData]);

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
        setRecentActivities(prev => mergeRecentActivities(prev, 5));
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

  // Manual refresh function for pull-to-refresh functionality
  const handleManualRefresh = useCallback(() => {
    if (!isOnlineStatus) {
      // If offline, just show a toast or alert
      console.log('Cannot refresh while offline');
      return;
    }
    
    // Don't set isLoading true here to avoid skeleton flash
    setDataSource('loading'); // Just indicate refresh is happening
    
    // Clear all promises and start fresh
    const statsPromise = userService.getUserStats(user.id);
    const activityPromise = activityService.getUserActivity(user.id, 5);
    
    Promise.all([statsPromise, activityPromise])
      .then(([statsResult, activityResult]) => {
        if (!mountedRef.current) return;
        
        // Handle stats update
        if (!statsResult.error) {
          const statsData = statsResult.data;
          setStats({
            points: statsData?.points || 0,
            pickups: statsData?.pickups || 0,
            reports: statsData?.reports || 0,
            batches: statsData?.batches || 0,
            totalBags: statsData?.totalBags || 0,
          });
          setDataSource('network');
          // Cache the refreshed data
          cacheUserStats(user.id, statsData);
        }
        
        // Handle activity update
        if (!activityResult.error && activityResult.data?.length > 0) {
          const activityData = activityResult.data;
          setRecentActivities(activityData.map(activity => ({
            id: activity.id,
            type: activity.type,
            message: activity.details || `${activity.type} activity`,
            timestamp: activity.created_at,
            points: activity.points || 0
          })));
          // Cache the refreshed activity
          if (Array.isArray(activityData)) {
            cacheUserActivity(user.id, activityData);
          }
        }
      })
      .catch(error => {
        console.error('Error during manual refresh:', error);
      })
      .finally(() => {
        if (mountedRef.current) {
          setDataSource('network'); // Ensure we clear the loading state
        }
      });
  }, [user?.id, isOnlineStatus]);
  
  // Performance optimization: Only show skeleton if we truly have no data
  // Memoize non-critical UI elements to avoid unnecessary re-renders
  const ActivitySection = useMemo(() => {
    return (
      <div className="activity-card bg-gradient-to-br from-purple-800 to-purple-900 rounded-lg shadow-lg p-6 mb-6 relative" loading="lazy">
        <h2 className="text-xl font-bold text-white mb-4">Recent Activity</h2>
        <div className="space-y-3">
          {!recentActivities || !Array.isArray(recentActivities) || recentActivities.length === 0 ? (
            <div className="text-center py-6 text-purple-300">
              <p>No recent activities yet</p>
            </div>
          ) : (
            Array.isArray(recentActivities) && recentActivities.map((activity, index) => (
              <div 
                key={activity.id || `activity-${index}`}
                className="bg-purple-900 bg-opacity-50 rounded-lg p-4 mb-3 flex items-center"
                loading={index > 2 ? "lazy" : "eager"}
              >
                <div className="flex-shrink-0 mr-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-white">
                    {activity.type === 'pickup' && (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" />
                      </svg>
                    )}
                    {activity.type === 'report' && (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    )}
                    {activity.type === 'batch' && (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" />
                        <path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                    )}
                    {!['pickup', 'report', 'batch'].includes(activity.type) && (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="flex-grow">
                  <p className="text-sm font-medium text-white">{activity.message}</p>
                  <p className="text-xs text-purple-300">
                    {new Date(activity.timestamp).toLocaleString()}
                  </p>
                </div>
                {activity.points > 0 && (
                  <div className="flex-shrink-0 ml-2 bg-green-900 bg-opacity-50 px-2 py-1 rounded text-green-300 text-xs font-semibold">
                    +{activity.points} pts
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <div className="absolute bottom-4 right-4">
          <div 
            className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center text-white cursor-pointer hover:bg-purple-600"
            onClick={() => {/* View all activities */}}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
    );
  }, [recentActivities]); // Only re-render when activities change

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 via-blue-900 to-indigo-900">
      <DashboardOptimizer />
      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Horizontal Scrollable Stats Cards */}
        <div className="mb-6">
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex space-x-4 pb-2" style={{ width: 'fit-content' }}>
              
              {/* Batches & Bags Card */}
              <div className="dashboard-card bg-gradient-to-br from-emerald-700 to-green-800 rounded-lg shadow-lg p-6 min-w-[280px] relative overflow-hidden" fetchpriority="high">
                {/* Decorative Background Icon */}
                <div className="absolute top-2 left-2 opacity-20">
                  <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12,2A3,3 0 0,1 15,5V6H20A1,1 0 0,1 21,7V19A3,3 0 0,1 18,22H6A3,3 0 0,1 3,19V7A1,1 0 0,1 4,6H9V5A3,3 0 0,1 12,2M12,4A1,1 0 0,0 11,5V6H13V5A1,1 0 0,0 12,4M5,8V19A1,1 0 0,0 6,20H18A1,1 0 0,0 19,19V8H5Z" />
                  </svg>
                </div>
                
                {/* Content */}
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12,2A3,3 0 0,1 15,5V6H20A1,1 0 0,1 21,7V19A3,3 0 0,1 18,22H6A3,3 0 0,1 3,19V7A1,1 0 0,1 4,6H9V5A3,3 0 0,1 12,2M12,4A1,1 0 0,0 11,5V6H13V5A1,1 0 0,0 12,4M5,8V19A1,1 0 0,0 6,20H18A1,1 0 0,0 19,19V8H5Z" />
                      </svg>
                      <h3 className="text-white text-lg font-bold">Batches & Bags</h3>
                    </div>
                    <div className="bg-emerald-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                      Lv {Math.floor((stats.points || 0) / 100) + 1}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center space-x-6 mb-4">
                    <div className="text-center">
                      <p className="text-emerald-200 text-sm">Batches</p>
                      <p className="text-white text-2xl font-bold">{stats.batches || 0}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-emerald-200 text-sm">Bags</p>
                      <p className={`text-white text-2xl font-bold ${bagsPulse ? 'animate-pulse' : ''}`}>{stats.totalBags || 0}</p>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-emerald-900/40 rounded-full h-2 mb-2">
                    <div 
                      className="bg-emerald-400 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${Math.min(((stats.points || 0) % 100) / 100 * 100, 100)}%` }}
                    ></div>
                  </div>
                  
                  <p className="text-emerald-200 text-sm text-center">
                    {100 - ((stats.points || 0) % 100)} more to level up
                  </p>
                </div>
              </div>
              
              {/* Pickups Card */}
              <div className="dashboard-card bg-gradient-to-br from-teal-600 to-cyan-700 rounded-lg shadow-lg p-6 min-w-[280px] relative overflow-hidden" fetchpriority="high">
                {/* Decorative Background Icon */}
                <div className="absolute top-2 left-2 opacity-20">
                  <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19,7H18V6A2,2 0 0,0 16,4H8A2,2 0 0,0 6,6V7H5A1,1 0 0,0 4,8V19A3,3 0 0,0 7,22H17A3,3 0 0,0 20,19V8A1,1 0 0,0 19,7M8,6H16V7H8V6M18,19A1,1 0 0,1 17,20H7A1,1 0 0,1 6,19V9H8V10A1,1 0 0,0 9,11H15A1,1 0 0,0 16,10V9H18V19Z" />
                  </svg>
                </div>
                
                {/* Content */}
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19,7H18V6A2,2 0 0,0 16,4H8A2,2 0 0,0 6,6V7H5A1,1 0 0,0 4,8V19A3,3 0 0,0 7,22H17A3,3 0 0,0 20,19V8A1,1 0 0,0 19,7M8,6H16V7H8V6M18,19A1,1 0 0,1 17,20H7A1,1 0 0,1 6,19V9H8V10A1,1 0 0,0 9,11H15A1,1 0 0,0 16,10V9H18V19Z" />
                      </svg>
                      <h3 className="text-white text-lg font-bold">Pickups</h3>
                    </div>
                    <div className="bg-teal-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                      Lv {Math.floor((stats.pickups || 0) / 5) + 1}
                    </div>
                  </div>
                  
                  <div className="text-center mb-4">
                    <p className="text-white text-4xl font-bold">{stats.pickups || 0}</p>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-teal-800/40 rounded-full h-2 mb-2">
                    <div 
                      className="bg-cyan-400 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${Math.min(((stats.pickups || 0) % 5) / 5 * 100, 100)}%` }}
                    ></div>
                  </div>
                  
                  <p className="text-cyan-200 text-sm text-center">
                    {5 - ((stats.pickups || 0) % 5)} more to level up
                  </p>
                </div>
              </div>

              {/* Reports Card */}
              <div className="dashboard-card bg-gradient-to-br from-amber-700 to-yellow-800 rounded-lg shadow-lg p-6 min-w-[280px] relative overflow-hidden" fetchpriority="high">
                {/* Decorative Background Icon */}
                <div className="absolute top-2 left-2 opacity-20">
                  <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                  </svg>
                </div>
                
                {/* Content */}
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                      </svg>
                      <h3 className="text-white text-lg font-bold">Reports</h3>
                    </div>
                    <div className="bg-amber-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                      Lv {Math.floor((stats.reports || 0) / 3) + 1}
                    </div>
                  </div>
                  
                  <div className="text-center mb-4">
                    <p className="text-white text-4xl font-bold">{stats.reports || 0}</p>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-amber-900/40 rounded-full h-2 mb-2">
                    <div 
                      className="bg-yellow-400 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${Math.min(((stats.reports || 0) % 3) / 3 * 100, 100)}%` }}
                    ></div>
                  </div>
                  
                  <p className="text-amber-200 text-sm text-center">
                    {3 - ((stats.reports || 0) % 3)} more to level up
                  </p>
                </div>
              </div>
              
            </div>
          </div>
        </div>

        {/* Essential Action Buttons - Original Design */}
        <div className="mb-8">
          <div className="grid gap-4">
            {/* Digital Bin Button */}
            <button 
              onClick={() => navigate('/digital-bin')}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 px-6 rounded-lg shadow-lg transition-all duration-200 flex items-center justify-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Digital Bin</span>
            </button>
            
            {/* View Rewards Button */}
            <button 
              onClick={() => navigate('/rewards')}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-4 px-6 rounded-lg shadow-lg transition-all duration-200 flex items-center justify-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
              <span>View Rewards</span>
            </button>
          </div>
        </div>

        {/* Recent Activity - Original Dark Theme */}
        <div className="bg-gradient-to-r from-purple-800 to-purple-700 rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white text-lg font-bold">Recent Activity</h3>
            <Link
              to="/activity"
              className="text-sm text-blue-300 hover:text-blue-200 underline underline-offset-2"
            >
              View all activity →
            </Link>
          </div>
          {ActivitySection}
        </div>

        {/* Active Pickup Card */}
        {activePickups && activePickups.length > 0 && (
          <div className="bg-gradient-to-r from-purple-800 to-purple-700 rounded-lg shadow-lg p-6 mt-6">
            <h3 className="text-white text-lg font-bold mb-4">Active Pickup</h3>
            <div className="bg-purple-900/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Status: <span className="text-green-400">{activePickups[0].status}</span></p>
                  <p className="text-sm text-gray-300">Collector: {activePickups[0].collector_name}</p>
                  <p className="text-sm text-gray-300">Location: {activePickups[0].address}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-white">{activePickups[0].number_of_bags} bags</p>
                  <p className="text-sm text-green-400 font-medium">+{activePickups[0].points} pts</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
