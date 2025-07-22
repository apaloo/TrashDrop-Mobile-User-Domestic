import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  cacheUserStats, 
  getCachedUserStats, 
  cacheUserActivity, 
  getCachedUserActivity,
  isOnline 
} from '../utils/offlineStorage.js';
import performanceMonitor from '../utils/performanceMonitor.js';

/**
 * Custom hook for optimized data fetching with caching and offline support
 * @param {Object} options - Configuration options
 * @returns {Object} Data fetching state and functions
 */
export const useOptimizedData = (options = {}) => {
  const {
    userId,
    services,
    enableCache = true,
    cacheTimeout = 24 * 60 * 60 * 1000, // 24 hours
    retryAttempts = 3,
    retryDelay = 1000
  } = options;

  const [data, setData] = useState({
    stats: {
      points: 0,
      pickups: 0,
      reports: 0,
      batches: 0,
      totalBags: 0,
    },
    activity: [],
    pickup: null
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState('loading');
  const [isOnlineStatus, setIsOnlineStatus] = useState(isOnline());
  
  const abortControllerRef = useRef(null);
  const cacheRef = useRef(new Map());

  // Online status monitoring
  useEffect(() => {
    const handleOnlineChange = () => setIsOnlineStatus(isOnline());
    
    window.addEventListener('online', handleOnlineChange);
    window.addEventListener('offline', handleOnlineChange);
    
    return () => {
      window.removeEventListener('online', handleOnlineChange);
      window.removeEventListener('offline', handleOnlineChange);
    };
  }, []);

  // Cleanup function
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Retry mechanism with exponential backoff
  const retryOperation = useCallback(async (operation, attempts = retryAttempts) => {
    let lastError = null;
    
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === attempts - 1) {
          throw lastError;
        }
        
        // Exponential backoff delay
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }, [retryAttempts, retryDelay]);

  // Check if cached data is still valid
  const isCacheValid = useCallback((cachedData) => {
    if (!cachedData || !cachedData.cached_at) return false;
    
    const cacheAge = Date.now() - cachedData.cached_at;
    return cacheAge < cacheTimeout;
  }, [cacheTimeout]);

  // Load data from cache
  const loadFromCache = useCallback(async () => {
    if (!enableCache || !userId) return null;
    
    try {
      performanceMonitor.startTimer('Cache Load');
      
      const [cachedStats, cachedActivity] = await Promise.all([
        getCachedUserStats(userId),
        getCachedUserActivity(userId, 10)
      ]);
      
      performanceMonitor.endTimer('Cache Load');
      
      if (cachedStats && isCacheValid(cachedStats)) {
        setData(prevData => ({
          ...prevData,
          stats: {
            points: cachedStats.points || 0,
            pickups: cachedStats.pickups || 0,
            reports: cachedStats.reports || 0,
            batches: cachedStats.batches || 0,
            totalBags: cachedStats.totalBags || 0,
          }
        }));
        setDataSource('cache');
      }
      
      if (cachedActivity && cachedActivity.length > 0) {
        const formattedActivity = cachedActivity.map(activity => ({
          id: activity.id,
          type: activity.type,
          message: activity.details || `${activity.type} activity`,
          timestamp: activity.created_at,
          points: activity.points || 0
        }));
        
        setData(prevData => ({
          ...prevData,
          activity: formattedActivity
        }));
      }
      
      return { stats: cachedStats, activity: cachedActivity };
    } catch (error) {
      console.warn('Error loading from cache:', error);
      return null;
    }
  }, [enableCache, userId, isCacheValid]);

  // Fetch fresh data from network
  const fetchFromNetwork = useCallback(async () => {
    if (!services || !userId) return null;
    
    try {
      performanceMonitor.startTimer('Network Fetch');
      
      // Create abort controller for this request
      abortControllerRef.current = new AbortController();
      
      // Parallel data fetching with Promise.allSettled for better error handling
      const [statsResult, activityResult, pickupResult] = await Promise.allSettled([
        retryOperation(() => services.userService.getUserStats(userId)),
        retryOperation(() => services.activityService.getUserActivity(userId, 10)),
        retryOperation(() => services.pickupService.getActivePickup(userId))
      ]);
      
      performanceMonitor.endTimer('Network Fetch');
      
      const results = {
        stats: null,
        activity: null,
        pickup: null
      };
      
      // Process stats result
      if (statsResult.status === 'fulfilled' && !statsResult.value.error) {
        const statsData = statsResult.value.data;
        results.stats = {
          points: statsData?.points || 0,
          pickups: statsData?.pickups || 0,
          reports: statsData?.reports || 0,
          batches: statsData?.batches || 0,
          totalBags: statsData?.totalBags || 0,
        };
        
        setData(prevData => ({ ...prevData, stats: results.stats }));
        setDataSource('network');
        
        // Cache the fresh data
        if (enableCache) {
          await cacheUserStats(userId, results.stats).catch(console.warn);
        }
      }
      
      // Process activity result
      if (activityResult.status === 'fulfilled' && !activityResult.value.error) {
        const activityData = activityResult.value.data || [];
        results.activity = activityData.map(activity => ({
          id: activity.id,
          type: activity.type,
          message: activity.details || `${activity.type} activity`,
          timestamp: activity.created_at,
          points: activity.points || 0
        }));
        
        setData(prevData => ({ ...prevData, activity: results.activity }));
        
        // Cache the fresh activity
        if (enableCache) {
          await cacheUserActivity(userId, activityData).catch(console.warn);
        }
      }
      
      // Process pickup result
      if (pickupResult.status === 'fulfilled' && !pickupResult.value.error) {
        const pickupData = pickupResult.value.data;
        if (pickupData) {
          results.pickup = {
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
          
          setData(prevData => ({ ...prevData, pickup: results.pickup }));
        }
      }
      
      return results;
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Network fetch error:', error);
        setError(error);
      }
      return null;
    }
  }, [services, userId, retryOperation, enableCache]);

  // Main fetch function
  const fetchData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Step 1: Load from cache immediately if online (for better UX)
      if (isOnlineStatus) {
        await loadFromCache();
      }
      
      // Step 2: Fetch fresh data if online, or rely on cache if offline
      if (isOnlineStatus) {
        await fetchFromNetwork();
      } else {
        // Offline mode - load from cache only
        console.log('Offline mode: Loading from cache only');
        const cachedData = await loadFromCache();
        
        if (!cachedData) {
          setDataSource('no-data');
        } else {
          setDataSource('cache');
        }
      }
      
    } catch (error) {
      console.error('Error fetching data:', error);
      setError(error);
      
      // Try to load cached data as fallback
      await loadFromCache();
    } finally {
      setLoading(false);
    }
  }, [userId, isOnlineStatus, loadFromCache, fetchFromNetwork]);

  // Refresh function
  const refresh = useCallback(async () => {
    if (isOnlineStatus) {
      await fetchData();
    }
  }, [fetchData, isOnlineStatus]);

  // Clear cache function
  const clearCache = useCallback(async () => {
    cacheRef.current.clear();
    // Could also clear IndexedDB cache here if needed
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Monitor memory usage in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      performanceMonitor.logMemoryUsage('useOptimizedData hook');
    }
  }, [data]);

  return {
    data,
    loading,
    error,
    dataSource,
    isOnline: isOnlineStatus,
    refresh,
    clearCache,
    // Computed values for better performance
    hasData: Object.keys(data).some(key => 
      key === 'stats' ? data[key].points > 0 || data[key].pickups > 0 : 
      Array.isArray(data[key]) ? data[key].length > 0 : 
      Boolean(data[key])
    ),
    isStale: dataSource === 'cache' && isOnlineStatus
  };
};

export default useOptimizedData;
