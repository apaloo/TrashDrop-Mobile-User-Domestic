import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import appConfig from '../utils/app-config.js';
import { useAuth } from '../context/AuthContext.js';
import DashboardSkeleton from '../components/SkeletonLoader.js';
import ActivePickupCard from '../components/ActivePickupCard.js';
import supabase from '../utils/supabaseClient.js';
import { userService, activityService, pickupService } from '../services/index.js';
import { 
  cacheUserStats, 
  getCachedUserStats, 
  cacheUserActivity, 
  getCachedUserActivity,
  isOnline 
} from '../utils/offlineStorage.js';

// Lazy-loaded map components removed since map is not currently used in dashboard
// Can be re-enabled when map functionality is needed

/**
 * Dashboard page component showing user's activity and nearby trash drop points
 */
const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    points: 0,
    pickups: 0,
    reports: 0,
    batches: 0,
    totalBags: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [activePickup, setActivePickup] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnlineStatus, setIsOnlineStatus] = useState(isOnline());
  const [dataSource, setDataSource] = useState('loading'); // 'cache', 'network', 'loading'
  const sessionRefreshRef = useRef(null);
  const mountedRef = useRef(true);
  
  // Cleanup function
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  // Optimized data fetching with offline support
  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    let isCancelled = false;

    const loadDashboardData = async () => {
      try {
        setIsLoading(true);
        
        // Step 1: Try to load cached data immediately for better UX
        if (isOnlineStatus) {
          console.log('Loading cached data while fetching fresh data...');
          const [cachedStats, cachedActivity] = await Promise.all([
            getCachedUserStats(user.id),
            getCachedUserActivity(user.id, 3)
          ]);
          
          if (cachedStats && !isCancelled) {
            setStats({
              points: cachedStats.points || 0,
              pickups: cachedStats.pickups || 0,
              reports: cachedStats.reports || 0,
              batches: cachedStats.batches || 0,
              totalBags: cachedStats.totalBags || 0,
            });
            setDataSource('cache');
          }
          
          if (cachedActivity && cachedActivity.length > 0 && !isCancelled) {
            setRecentActivity(cachedActivity.map(activity => ({
              id: activity.id,
              type: activity.type,
              message: activity.details || `${activity.type} activity`,
              timestamp: activity.created_at,
              points: activity.points || 0
            })));
          }
        }
        
        // Step 2: Fetch fresh data if online
        if (isOnlineStatus) {
          console.log('Fetching fresh dashboard data...');
          
          // Get valid session
          await getValidSession();
          
          // Parallel data fetching for better performance
          const [statsResult, activityResult, pickupResult] = await Promise.allSettled([
            userService.getUserStats(user.id),
            activityService.getUserActivity(user.id, 3),
            pickupService.getActivePickup(user.id)
          ]);
          
          if (!isCancelled) {
            // Process stats
            if (statsResult.status === 'fulfilled' && !statsResult.value.error) {
              const statsData = statsResult.value.data;
              const newStats = {
                points: statsData?.points || 0,
                pickups: statsData?.pickups || 0,
                reports: statsData?.reports || 0,
                batches: statsData?.batches || 0,
                totalBags: statsData?.totalBags || 0,
              };
              setStats(newStats);
              setDataSource('network');
              
              // Cache the fresh data
              await cacheUserStats(user.id, newStats).catch(console.warn);
            }
            
            // Process activity
            if (activityResult.status === 'fulfilled' && !activityResult.value.error) {
              const activityData = activityResult.value.data || [];
              const formattedActivity = activityData.map(activity => ({
                id: activity.id,
                type: activity.type,
                message: activity.details || `${activity.type} activity`,
                timestamp: activity.created_at,
                points: activity.points || 0
              }));
              setRecentActivity(formattedActivity);
              
              // Cache the fresh activity
              await cacheUserActivity(user.id, activityData).catch(console.warn);
            }
            
            // Process pickup
            if (pickupResult.status === 'fulfilled' && !pickupResult.value.error) {
              const pickupData = pickupResult.value.data;
              if (pickupData) {
                const formattedPickup = {
                  id: pickupData.id,
                  status: pickupData.status,
                  collector_id: pickupData.collector_id,
                  collector_name: pickupData.collector_name || 'Assigned Collector',
                  location: pickupData.location,
                  address: pickupData.location?.address || pickupData.address,
                  waste_type: pickupData.waste_type,
                  number_of_bags: pickupData.bags || 0,
                  points: pickupData.points_earned || 0,
                  eta_minutes: pickupData.eta_minutes,
                  distance: pickupData.distance,
                  created_at: pickupData.created_at,
                  updated_at: pickupData.updated_at
                };
                setActivePickup(formattedPickup);
                sessionStorage.setItem(`activePickup_${user.id}`, JSON.stringify(formattedPickup));
              } else {
                setActivePickup(null);
                sessionStorage.removeItem(`activePickup_${user.id}`);
              }
            } else {
              // Try to load cached pickup
              try {
                const cachedPickup = sessionStorage.getItem(`activePickup_${user.id}`);
                if (cachedPickup) {
                  setActivePickup(JSON.parse(cachedPickup));
                }
              } catch (e) {
                console.warn('Error loading cached pickup:', e);
              }
            }
          }
        } else {
          // Offline mode - load from cache only
          console.log('Offline mode: Loading data from cache...');
          setDataSource('cache');
          
          const [cachedStats, cachedActivity] = await Promise.all([
            getCachedUserStats(user.id),
            getCachedUserActivity(user.id, 3)
          ]);
          
          if (cachedStats && !isCancelled) {
            setStats({
              points: cachedStats.points || 0,
              pickups: cachedStats.pickups || 0,
              reports: cachedStats.reports || 0,
              batches: cachedStats.batches || 0,
              totalBags: cachedStats.totalBags || 0,
            });
          }
          
          if (cachedActivity && !isCancelled) {
            setRecentActivity(cachedActivity.map(activity => ({
              id: activity.id,
              type: activity.type,
              message: activity.details || `${activity.type} activity`,
              timestamp: activity.created_at,
              points: activity.points || 0
            })));
          }
          
          // Load cached pickup
          try {
            const cachedPickup = sessionStorage.getItem(`activePickup_${user.id}`);
            if (cachedPickup && !isCancelled) {
              setActivePickup(JSON.parse(cachedPickup));
            }
          } catch (e) {
            console.warn('Error loading cached pickup:', e);
          }
        }
        
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        if (!isCancelled) {
          // Try to load cached data as fallback
          const [cachedStats, cachedActivity] = await Promise.all([
            getCachedUserStats(user.id).catch(() => null),
            getCachedUserActivity(user.id, 3).catch(() => [])
          ]);
          
          if (cachedStats) {
            setStats({
              points: cachedStats.points || 0,
              pickups: cachedStats.pickups || 0,
              reports: cachedStats.reports || 0,
              batches: cachedStats.batches || 0,
              totalBags: cachedStats.totalBags || 0,
            });
            setDataSource('cache');
          }
          
          if (cachedActivity && cachedActivity.length > 0) {
            setRecentActivity(cachedActivity.map(activity => ({
              id: activity.id,
              type: activity.type,
              message: activity.details || `${activity.type} activity`,
              timestamp: activity.created_at,
              points: activity.points || 0
            })));
          }
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadDashboardData();

    return () => {
      isCancelled = true;
    };
  }, [user?.id, isOnlineStatus, getValidSession]);

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

  // Show skeleton loader during initial loading
  if (isLoading && dataSource === 'loading') {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6 pb-28 md:pb-6">
      {/* Offline/Data Source Indicator */}
      {!isOnlineStatus && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3 mb-4">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-amber-800 dark:text-amber-200 text-sm">
              You're offline. Showing cached data from your last sync.
            </span>
          </div>
        </div>
      )}
      {dataSource === 'cache' && isOnlineStatus && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-2 mb-4">
          <div className="flex items-center">
            <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-blue-800 dark:text-blue-200 text-xs">
              Showing cached data while loading fresh updates...
            </span>
          </div>
        </div>
      )}
      {/* User Stats Card */}
      <div className="bg-white dark:bg-gray-800 pt-2 px-6 pb-6 rounded-lg shadow-md mb-6">
        
        {/* Stats cards - horizontal scroll on mobile, grid on desktop */}
        <div className="flex md:grid md:grid-cols-4 gap-4 mb-6 overflow-x-auto pb-4 snap-x snap-mandatory scroll-pl-6 touch-pan-x">
          <div className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-lg relative overflow-hidden md:min-w-0 min-w-[280px] flex-shrink-0 md:flex-1 snap-center">
            <div className="flex justify-between items-center">
              <h3 className="text-sm md:text-lg font-semibold text-purple-700 dark:text-purple-300">Batches & Bags</h3>
              <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full">Lv {memoizedStats.batchLevel}</span>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <p className="text-xs text-purple-700 dark:text-purple-300">Batches</p>
                <p className="text-2xl md:text-3xl font-bold text-purple-800 dark:text-purple-200">{stats.batches}</p>
              </div>
              <div className="ml-4">
                <p className="text-xs text-indigo-700 dark:text-indigo-300">Available Bags</p>
                <p className="text-2xl md:text-3xl font-bold text-indigo-800 dark:text-indigo-200">{stats.totalBags}</p>
              </div>
            </div>
            {/* Progress bar */}
            <div className="w-full h-2 bg-purple-200 dark:bg-purple-700 rounded-full mt-2">
              <div 
                className="h-2 bg-purple-600 dark:bg-purple-400 rounded-full" 
                style={{ width: `${memoizedStats.batchProgress}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <p className="text-purple-600 dark:text-purple-300">{memoizedStats.batchesNeeded} more to level up</p>
              <p className="text-indigo-600 dark:text-indigo-300">
                {stats.totalBags > 0 ? `${stats.totalBags} bags available` : "No bags available"}
              </p>
            </div>
          </div>

          <div className="bg-green-50 dark:bg-green-900/30 p-3 rounded-lg relative overflow-hidden md:min-w-0 min-w-[280px] flex-shrink-0 md:flex-1 snap-center">
            <div className="flex justify-between items-center">
              <h3 className="text-sm md:text-lg font-semibold text-green-700 dark:text-green-300">Pickups</h3>
              <span className="bg-green-600 text-white text-xs px-2 py-1 rounded-full">Lv {memoizedStats.pickupLevel}</span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-green-800 dark:text-green-200">{stats.pickups}</p>
            {/* Progress bar */}
            <div className="w-full h-2 bg-green-200 dark:bg-green-700 rounded-full mt-2">
              <div 
                className="h-2 bg-green-600 dark:bg-green-400 rounded-full" 
                style={{ width: `${memoizedStats.pickupProgress}%` }}
              ></div>
            </div>
            <p className="text-xs text-green-600 dark:text-green-300 mt-1">{memoizedStats.pickupsNeeded} more to level up</p>
            {/* Achievement badge */}
            {memoizedStats.hasPickupAchievement && (
              <div className="absolute -top-1 -right-1">
                <span className="flex h-6 w-6">
                  <span className="relative rounded-full h-6 w-6 bg-green-500 flex items-center justify-center">
                    <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                    </svg>
                  </span>
                </span>
              </div>
            )}
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg relative overflow-hidden md:min-w-0 min-w-[280px] flex-shrink-0 md:flex-1 snap-center">
            <div className="flex justify-between items-center">
              <h3 className="text-sm md:text-lg font-semibold text-blue-700 dark:text-blue-300">Points Earned</h3>
              <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">Lv {memoizedStats.pointsLevel}</span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-blue-800 dark:text-blue-200">{stats.points}</p>
            {/* Progress bar */}
            <div className="w-full h-2 bg-blue-200 dark:bg-blue-700 rounded-full mt-2">
              <div 
                className="h-2 bg-blue-600 dark:bg-blue-400 rounded-full" 
                style={{ width: `${memoizedStats.pointsProgress}%` }}
              ></div>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">{memoizedStats.pointsNeeded} points to next level</p>
            {/* Badge */}
            {memoizedStats.hasPointsAchievement && (
              <div className="absolute -top-1 -right-1">
                <span className="flex h-6 w-6">
                  <span className="animate-ping absolute h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative rounded-full h-6 w-6 bg-blue-500 flex items-center justify-center">
                    <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </span>
                </span>
              </div>
            )}
          </div>
          
          <div className="bg-yellow-50 dark:bg-yellow-900/30 p-3 rounded-lg relative overflow-hidden md:min-w-0 min-w-[280px] flex-shrink-0 md:flex-1 snap-center">
            <div className="flex justify-between items-center">
              <h3 className="text-sm md:text-lg font-semibold text-yellow-700 dark:text-yellow-300">Reports</h3>
              <span className="bg-yellow-600 text-white text-xs px-2 py-1 rounded-full">Lv {Math.floor(stats.reports / 3) + 1}</span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-yellow-800 dark:text-yellow-200">{stats.reports}</p>
            {/* Progress bar */}
            <div className="w-full h-2 bg-yellow-200 dark:bg-yellow-700 rounded-full mt-2">
              <div 
                className="h-2 bg-yellow-600 dark:bg-yellow-400 rounded-full" 
                style={{ width: `${(stats.reports % 3) * 33.33}%` }}
              ></div>
            </div>
            <p className="text-xs text-yellow-600 dark:text-yellow-300 mt-1">{3 - (stats.reports % 3)} more to level up</p>
            {/* Achievement badge */}
            {stats.reports >= 3 && (
              <div className="absolute -top-1 -right-1">
                <span className="flex h-6 w-6">
                  <span className="relative rounded-full h-6 w-6 bg-yellow-500 flex items-center justify-center">
                    <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Link 
            to="/schedule-pickup" 
            className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-dark transition-colors flex items-center justify-center"
          >
            <span className="inline-flex items-center justify-center">Schedule Pickup</span>
          </Link>
          
          <Link 
            to="/rewards" 
            className="bg-yellow-500 text-white px-4 py-2 rounded-md hover:bg-yellow-600 transition-colors flex items-center justify-center"
          >
            <span className="inline-flex items-center justify-center">View Rewards</span>
          </Link>
        </div>
      </div>
      
      {/* Recent activity */}
      <div className="bg-white dark:bg-gray-800 pt-2 px-6 pb-6 rounded-lg shadow-md mb-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Recent Activity</h2>
        
        {recentActivity.length > 0 ? (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="py-4 flex items-center">
                <ActivityIcon type={activity.type} />
                
                <div className="ml-4 flex-1">
                  <h3 className="text-lg font-medium text-gray-800 dark:text-white capitalize">
                    {activity.type} - {activity.status}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(activity.date).toLocaleDateString()}
                  </p>
                </div>
                
                {activity.points > 0 && (
                  <div className="bg-green-100 dark:bg-green-900/50 px-3 py-1 rounded-full">
                    <span className="text-green-800 dark:text-green-200 font-medium">
                      +{activity.points} points
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400">No recent activity</p>
        )}
        
        <div className="mt-4">
          <Link 
            to="/activity" 
            className="text-primary dark:text-primary-light hover:underline"
          >
            View all activity →
          </Link>
        </div>
      </div>
      
      {/* Active Pickup Request Card */}
      {activePickup && (
        <ActivePickupCard 
          activePickup={activePickup}
          onCancel={(pickupId) => {
            // Handle cancel pickup
            console.log('Cancelling pickup:', pickupId);
            
            // Update the status in Supabase
            supabase
              .from('pickups')
              .update({ 
                status: 'cancelled', 
                updated_at: new Date().toISOString() 
              })
              .eq('id', pickupId)
              .then(({ error }) => {
                if (error) {
                  console.error('Error cancelling pickup:', error);
                } else {
                  // Set to null immediately to remove from UI
                  setActivePickup(null);
                }
              });
          }}
          onRefresh={() => {
            // Handle refresh pickup data
            console.log('Refreshing pickup data');
            
            // Re-fetch updated data from Supabase
            if (user && user.id) {
              supabase
                .from('pickups')
                .select('*')
                .eq('user_id', user.id)
                .in('status', ['waiting_for_collector', 'collector_assigned', 'en_route', 'arrived'])
                .order('created_at', { ascending: false })
                .limit(1)
                .single()
                .then(({ data, error }) => {
                  if (error && error.code !== 'PGRST116') {
                    console.error('Error refreshing pickup data:', error);
                  }
                  
                  if (data) {
                    setActivePickup({
                      id: data.id,
                      status: data.status,
                      collector_id: data.collector_id,
                      collector_name: data.collector_name || 'Assigned Collector',
                      location: data.location,
                      address: data.address,
                      waste_type: data.waste_type,
                      number_of_bags: data.number_of_bags,
                      points: data.points || 0,
                      eta_minutes: data.eta_minutes,
                      distance: data.distance
                    });
                  } else {
                    setActivePickup(null);
                  }
                });
            }
          }}
        />
      )}
      
      {/* Development Tools section removed */}
    </div>
  );
};

export default Dashboard;
