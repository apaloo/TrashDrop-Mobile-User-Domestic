import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.js';
import supabase from '../utils/supabaseClient.js';
import LoadingSpinner from '../components/LoadingSpinner.js';

/**
 * Activity page to display user's complete activity history
 */
const Activity = () => {
  const { user } = useAuth();
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [hasMoreData, setHasMoreData] = useState(true);
  const [cursors, setCursors] = useState({
    user_activity: null,
    illegal_dumping_mobile: null,
    pickup_requests: null
  });
  const itemsPerPage = 20; // Increased for better infinite scroll experience
  const mountedRef = useRef(true);
  const observerRef = useRef(null);
  const loadingRef = useRef(null);
  const cursorsRef = useRef({ user_activity: null, illegal_dumping_mobile: null, pickup_requests: null });

  // Enhanced session refresh function with validation
  const refreshAndValidateSession = async () => {
    try {
      console.log('Attempting to refresh session for activity fetch');
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.warn('Session refresh failed in Activity component:', error.message);
        return { success: false, error };
      }
      
      if (!data?.session) {
        console.warn('Session refresh did not return a valid session in Activity component');
        return { success: false };
      }
      
      console.log('Session refreshed successfully in Activity component');
      return { success: true };
    } catch (err) {
      console.error('Error during session refresh in Activity component:', err);
      return { success: false, error: err };
    }
  };
  
  // Infinite scroll fetch function with cursor-based pagination
  const fetchActivities = useCallback(async (isLoadMore = false, retryCount = 0) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1500;
    
    if (!user?.id || !mountedRef.current) {
      console.log('No user found or component unmounted, cannot fetch activities');
      setIsLoading(false);
      return;
    }
    
    const isOffline = !navigator.onLine;
    
    console.log('Fetching activities for user:', user.id, 'isLoadMore:', isLoadMore);
    
    if (!isLoadMore) {
      setIsLoading(true);
      setActivities([]);
      setCursors({ user_activity: null, illegal_dumping_mobile: null, pickup_requests: null });
      cursorsRef.current = { user_activity: null, illegal_dumping_mobile: null, pickup_requests: null };
      setHasMoreData(true);
    } else {
      setIsLoadingMore(true);
    }
    
    setError('');

    // Define timeout wrapper for network operations
    const fetchWithTimeout = async (operation) => {
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Activity fetch timeout')), 8000));
      return Promise.race([operation(), timeout]);
    };
    
    if (isOffline) {
      setError('Internet connection required to load activities. Please connect and try again.');
      setIsLoading(false);
      setIsLoadingMore(false);
      return;
    }
    
    console.log(`Fetching activities from database (attempt ${retryCount + 1} of ${MAX_RETRIES + 1})`);
    
    // Try session refresh if not first attempt
    if (retryCount > 0) {
      const refreshResult = await refreshAndValidateSession();
      if (!refreshResult.success) {
        console.warn('Session refresh failed before fetching activities');
      }
    }

    try {
      let newActivities = [];
      let newCursors = { ...cursorsRef.current };
      let hasMore = false;
      
      if (filter === 'dumping_report') {
        // Single table query for dumping reports
        let query = supabase
          .from('illegal_dumping_mobile')
          .select('*')
          .eq('reported_by', user.id)
          .order('created_at', { ascending: false })
          .limit(itemsPerPage);
          
        if (cursorsRef.current.illegal_dumping_mobile) {
          query = query.lt('created_at', cursorsRef.current.illegal_dumping_mobile);
        }
          
        const { data: dumpingData, error: dumpingError } = await fetchWithTimeout(async () => query);
        
        if (dumpingError) {
          console.error('Error fetching dumping reports:', dumpingError);
          throw dumpingError;
        }
        
        newActivities = (dumpingData || []).map(item => ({ ...item, _source: 'illegal_dumping_mobile' }));
        hasMore = newActivities.length === itemsPerPage;
        
        if (newActivities.length > 0) {
          newCursors.illegal_dumping_mobile = newActivities[newActivities.length - 1].created_at;
        }
        
      } else if (filter === 'all') {
        // Fetch from all three tables with cursor-based pagination
        const itemsPerTable = Math.ceil(itemsPerPage / 3);
        
        const [activityResult, dumpingResult, pickupResult] = await Promise.allSettled([
          // User activity query
          fetchWithTimeout(async () => {
            let query = supabase
              .from('user_activity')
              .select('*')
              .eq('user_id', user.id)
              .neq('activity_type', 'pickup_request')
              .order('created_at', { ascending: false })
              .limit(itemsPerTable);
              
            if (cursorsRef.current.user_activity) {
              query = query.lt('created_at', cursorsRef.current.user_activity);
            }
            
            return query;
          }),
          // Dumping reports query
          fetchWithTimeout(async () => {
            let query = supabase
              .from('illegal_dumping_mobile')
              .select('*')
              .eq('reported_by', user.id)
              .order('created_at', { ascending: false })
              .limit(itemsPerTable);
              
            if (cursorsRef.current.illegal_dumping_mobile) {
              query = query.lt('created_at', cursorsRef.current.illegal_dumping_mobile);
            }
            
            return query;
          }),
          // Pickup requests query
          fetchWithTimeout(async () => {
            let query = supabase
              .from('pickup_requests')
              .select('*')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(itemsPerTable);
              
            if (cursorsRef.current.pickup_requests) {
              query = query.lt('created_at', cursorsRef.current.pickup_requests);
            }
            
            return query;
          })
        ]);
        
        let allTableActivities = [];
        
        // Process user_activity results
        if (activityResult.status === 'fulfilled' && activityResult.value?.data) {
          const activities = activityResult.value.data.map(item => ({ ...item, _source: 'user_activity' }));
          allTableActivities = [...allTableActivities, ...activities];
          if (activities.length > 0) {
            newCursors.user_activity = activities[activities.length - 1].created_at;
            hasMore = hasMore || activities.length === itemsPerTable;
          }
        }
        
        // Process dumping reports results
        if (dumpingResult.status === 'fulfilled' && dumpingResult.value?.data) {
          const activities = dumpingResult.value.data.map(item => ({ ...item, _source: 'illegal_dumping_mobile' }));
          allTableActivities = [...allTableActivities, ...activities];
          if (activities.length > 0) {
            newCursors.illegal_dumping_mobile = activities[activities.length - 1].created_at;
            hasMore = hasMore || activities.length === itemsPerTable;
          }
        }
        
        // Process pickup requests results
        if (pickupResult.status === 'fulfilled' && pickupResult.value?.data) {
          const activities = pickupResult.value.data.map(item => ({ ...item, _source: 'pickup_requests' }));
          allTableActivities = [...allTableActivities, ...activities];
          if (activities.length > 0) {
            newCursors.pickup_requests = activities[activities.length - 1].created_at;
            hasMore = hasMore || activities.length === itemsPerTable;
          }
        }
        
        // Sort all activities by created_at
        allTableActivities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        newActivities = allTableActivities.slice(0, itemsPerPage);
        
      } else if (filter === 'pickup_request') {
        // Single table query for pickup requests
        let query = supabase
          .from('pickup_requests')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(itemsPerPage);
          
        if (cursorsRef.current.pickup_requests) {
          query = query.lt('created_at', cursorsRef.current.pickup_requests);
        }
        
        const { data: pickupData, error: pickupError } = await fetchWithTimeout(async () => query);
        
        if (pickupError) {
          console.error('Error fetching pickup requests:', pickupError);
          throw pickupError;
        }
        
        newActivities = (pickupData || []).map(item => ({ ...item, _source: 'pickup_requests' }));
        hasMore = newActivities.length === itemsPerPage;
        
        if (newActivities.length > 0) {
          newCursors.pickup_requests = newActivities[newActivities.length - 1].created_at;
        }
        
      } else {
        // Single table query for specific activity types
        let query = supabase
          .from('user_activity')
          .select('*')
          .eq('user_id', user.id)
          .eq('activity_type', filter)
          .order('created_at', { ascending: false })
          .limit(itemsPerPage);
          
        if (cursorsRef.current.user_activity) {
          query = query.lt('created_at', cursorsRef.current.user_activity);
        }
        
        const { data: activityData, error: activitiesError } = await fetchWithTimeout(async () => query);
        
        if (activitiesError) {
          console.error('Error fetching activities data:', activitiesError);
          throw activitiesError;
        }
        
        newActivities = (activityData || []).map(item => ({ ...item, _source: 'user_activity' }));
        hasMore = newActivities.length === itemsPerPage;
        
        if (newActivities.length > 0) {
          newCursors.user_activity = newActivities[newActivities.length - 1].created_at;
        }
      }
      
      // Format activities
      const formattedActivities = newActivities.map(activity => {
        let formattedActivity;
        
        if (filter === 'dumping_report' || activity._source === 'illegal_dumping_mobile') {
          formattedActivity = {
            id: activity.id,
            type: 'dumping_report',
            status: activity.status || 'submitted',
            date: new Date(activity.created_at).toLocaleDateString(),
            points: 10,
            related_id: activity.id,
            description: `Reported ${activity.waste_type || 'illegal dumping'} (${activity.severity || 'medium'} severity)`,
            address: activity.location || 'Unknown location',
            created_at: activity.created_at
          };
        } else if (filter === 'pickup_request' || activity._source === 'pickup_requests') {
          formattedActivity = {
            id: activity.id,
            type: 'pickup_request',
            status: activity.status || 'submitted',
            date: new Date(activity.created_at).toLocaleDateString(),
            points: activity.points_earned || 0,
            related_id: activity.id,
            description: `${activity.waste_type || 'Waste'} Pickup - ${activity.bag_count || 1} bag(s)`,
            address: activity.location || 'Custom location',
            created_at: activity.created_at
          };
        } else {
          formattedActivity = {
            id: activity.id,
            type: activity.activity_type,
            status: activity.status || 'submitted',
            date: new Date(activity.created_at).toLocaleDateString(),
            points: activity.points || activity.points_impact || 0,
            related_id: activity.related_id || null,
            description: '',
            address: '',
            created_at: activity.created_at
          };
          
          if (activity.activity_type === 'qr_scan') {
            formattedActivity.description = 'QR Code Scan';
            formattedActivity.address = activity.details?.location_name || 'Public Bin';
          } else if (activity.activity_type === 'reward_redemption') {
            formattedActivity.description = activity.details?.reward_name || 'Reward Redeemed';
            formattedActivity.address = '';
          }
        }
        
        return formattedActivity;
      });
      
      // Update state
      setCursors(newCursors);
      cursorsRef.current = newCursors;
      setHasMoreData(hasMore);
      
      if (isLoadMore) {
        setActivities(prev => [...prev, ...formattedActivities]);
      } else {
        setActivities(formattedActivities);
      }
      
      setError('');
      console.log('Loaded activities:', {
        new: formattedActivities.length,
        total: isLoadMore ? activities.length + formattedActivities.length : formattedActivities.length,
        hasMore
      });
      
    } catch (error) {
      console.warn('Error in activities fetch:', error.message);
      
      if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAY * Math.pow(1.5, retryCount);
        console.log(`Retrying database fetch in ${delay}ms (attempt ${retryCount + 1} of ${MAX_RETRIES})...`);
        setTimeout(() => {
          fetchActivities(isLoadMore, retryCount + 1);
        }, delay);
        return;
      }
      
      if (error?.message?.includes('timeout')) {
        setError('Connection is slow. Activity data will load when network improves.');
      } else {
        setError('Unable to load activity history. Please check your connection.');
      }
      
      if (!isLoadMore) {
        setActivities([]);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [user?.id, filter]);
  
  // Initial load and filter changes
  useEffect(() => {
    fetchActivities(false);
  }, [user?.id, filter]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!loadingRef.current || !hasMoreData || isLoading || isLoadingMore) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreData && !isLoading && !isLoadingMore) {
          console.log('Loading more activities...');
          fetchActivities(true);
        }
      },
      { threshold: 0.1 }
    );
    
    observer.observe(loadingRef.current);
    observerRef.current = observer;
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMoreData, isLoading, isLoadingMore, fetchActivities]);

  // Listen to storage changes (e.g., other tabs) for userActivity updates
  useEffect(() => {
    const onStorage = (e) => {
      if (!e) return;
      if (!user) return;
      if (e.key === `userActivity_${user.id}`) {
        fetchActivities(false);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user?.id, fetchActivities]);
  
  // Listen for local activity events to refresh immediately
  useEffect(() => {
    const onLocalActivity = (e) => {
      try {
        const detailUserId = e?.detail?.userId;
        if (!user || (detailUserId && detailUserId !== user.id)) return;
        fetchActivities(false);
      } catch (_) {}
    };
    window.addEventListener('local-activity', onLocalActivity);
    return () => window.removeEventListener('local-activity', onLocalActivity);
  }, [user?.id, fetchActivities]);

  // Manual refresh handler
  const handleRefresh = () => {
    console.log('Manual refresh triggered');
    setIsLoading(true);
    setError('');
    fetchActivities(false);
  };

  // Handle filter change
  const handleFilterChange = (newFilter) => {
    console.log('Filter changed to:', newFilter);
    setFilter(newFilter);
    // Reset cursors and activities when filter changes
    const resetCursors = { user_activity: null, illegal_dumping_mobile: null, pickup_requests: null };
    setCursors(resetCursors);
    cursorsRef.current = resetCursors;
    setActivities([]);
    setHasMoreData(true);
  };

  // Activity card component
  const ActivityCard = ({ activity }) => {
    const getActivityIcon = () => {
      switch (activity.type) {
        case 'pickup_request':
          return (
            <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
          );
        case 'dumping_report':
          return (
            <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          );
        case 'qr_scan':
          return (
            <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
          );
        case 'reward_redemption':
          return (
            <div className="p-2 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
              <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          );
        default:
          return (
            <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-700">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          );
      }
    };
    
    return (
      <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-start">
          {getActivityIcon()}
          <div className="ml-4 flex-1">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
              <div>
                <h3 className="text-lg font-medium text-gray-800 dark:text-white capitalize">
                  {activity.type === 'pickup_request' ? 'Waste Pickup' : 
                   activity.type === 'dumping_report' ? 'Dumping Report' : 
                   activity.type === 'qr_scan' ? 'QR Code Scan' : 'Reward Redemption'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                  {activity.date} • {activity.description}
                </p>
                {activity.address && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {activity.address}
                  </p>
                )}
              </div>
              <div className="mt-2 sm:mt-0">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                  ${activity.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 
                    activity.status === 'scheduled' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' : 
                    activity.status === 'canceled' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' : 
                    'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'}`}>
                  {activity.status.charAt(0).toUpperCase() + activity.status.slice(1)}
                </span>
                {activity.isLocal && activity.sync_status === 'pending_sync' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 ml-2">
                    Pending Sync
                  </span>
                )}
                {activity.points !== 0 && (
                  <div className="mt-2">
                    <span className={`font-medium ${activity.points > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {activity.points > 0 ? '+' : ''}{activity.points} points
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  // Loading indicator for infinite scroll
  const InfiniteScrollLoader = () => {
    if (!hasMoreData) {
      return (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p>No more activities to load</p>
        </div>
      );
    }
    
    if (isLoadingMore) {
      return (
        <div className="flex justify-center items-center py-8">
          <LoadingSpinner />
          <span className="ml-2 text-gray-600 dark:text-gray-400">Loading more activities...</span>
        </div>
      );
    }
    
    return (
      <div className="text-center py-4 text-gray-500 dark:text-gray-400">
        <p>Scroll down to load more activities</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Fixed Header - positioned below navbar */}
      <div className="sticky top-0 bg-gray-50 dark:bg-gray-900 z-10 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 pt-2 pb-3">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Activity History</h1>
        </div>
        
        {/* Filter tabs - Sticky below header */}
        <div className="container mx-auto px-4 pb-3">
          <div className="flex bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden border border-gray-200 dark:border-gray-700">
            <button 
              className={`px-3 py-3 flex-1 text-center text-sm font-medium ${filter === 'all' ? 'bg-primary text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              onClick={() => handleFilterChange('all')}
            >
              All
            </button>
            <button 
              className={`px-3 py-3 flex-1 text-center text-sm font-medium ${filter === 'pickup_request' ? 'bg-primary text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              onClick={() => handleFilterChange('pickup_request')}
            >
              Pickups
            </button>
            <button 
              className={`px-3 py-3 flex-1 text-center text-sm font-medium ${filter === 'dumping_report' ? 'bg-primary text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              onClick={() => handleFilterChange('dumping_report')}
            >
              Reports
            </button>
            <button 
              className={`px-3 py-3 flex-1 text-center text-sm font-medium ${filter === 'qr_scan' ? 'bg-primary text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              onClick={() => handleFilterChange('qr_scan')}
            >
              Scans
            </button>
            <button 
              onClick={handleRefresh}
              className="px-3 py-3 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 flex items-center justify-center flex-shrink-0"
              aria-label="Refresh activity data"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-4">
          {/* Loading state */}
          {isLoading && (
            <div className="flex justify-center items-center py-12">
              <LoadingSpinner />
            </div>
          )}
          
          {/* Error state */}
          {error && !isLoading && (
            <div className="bg-red-50 dark:bg-red-900/40 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg shadow-sm relative mb-4" role="alert">
              <strong className="font-bold">Error: </strong>
              <span className="block sm:inline">{error}</span>
              <button 
                onClick={handleRefresh}
                className="mt-2 bg-red-600 hover:bg-red-700 text-white py-1 px-4 rounded"
              >
                Try Again
              </button>
            </div>
          )}
          
          {/* Activity list */}
          {!isLoading && !error && (
            <div className="space-y-4">
              {activities.length > 0 ? (
                <>
                  {activities.map(activity => (
                    <ActivityCard key={`${activity.id}-${activity.created_at}`} activity={activity} />
                  ))}
                  
                  {/* Infinite scroll loading indicator */}
                  <div ref={loadingRef}>
                    <InfiniteScrollLoader />
                  </div>
                </>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 text-center border border-gray-200 dark:border-gray-700">
                  <div className="text-gray-500 dark:text-gray-400 mb-4">
                    <svg className="w-16 h-16 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                    </svg>
                    <h3 className="text-xl font-medium mb-1">No activity yet</h3>
                    <p>Your activity history will appear here as you use the app.</p>
                  </div>
                  <div className="flex flex-col space-y-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Try these activities to get started:</p>
                    <a href="/pickup-request" className="text-blue-600 hover:underline">Request a trash pickup</a>
                    <a href="/dumping-report" className="text-blue-600 hover:underline">Report illegal dumping</a>
                    <a href="/scan" className="text-blue-600 hover:underline">Scan a QR code at a public bin</a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Activity;
