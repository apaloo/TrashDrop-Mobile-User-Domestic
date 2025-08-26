import React, { useState, useEffect, useRef } from 'react';
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
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 10;
  const mountedRef = useRef(true);

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
  
  // Create fetchActivities as a regular function to avoid useCallback dependency issues
  const fetchActivities = async (retryCount = 0) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1500;
    
    if (!user?.id || !mountedRef.current) {
      console.log('No user found or component unmounted, cannot fetch activities');
      setIsLoading(false);
      return;
    }
    
    const isOffline = !navigator.onLine;
    
    console.log('Fetching activities for user:', user.id);
    setIsLoading(true);
    setError('');
    
    // Calculate pagination offset using current state values
    const offset = (currentPage - 1) * itemsPerPage;
    
    // Define local activity loading function - consistently used throughout
    const loadLocalActivities = () => {
      try {
        const localKey = `userActivity_${user.id}`;
        const localRaw = JSON.parse(localStorage.getItem(localKey) || '[]');
        console.log('[Activity] Raw local activities:', localRaw);
        
        if (!Array.isArray(localRaw)) {
          console.warn('[Activity] Local activities is not an array:', localRaw);
          return [];
        }
        
        const localFiltered = localRaw.filter(a => {
          if (!a || !a.activity_type) return false;
          return filter === 'all' ? true : a.activity_type === filter;
        });
        
        console.log('[Activity] Filtered local activities:', localFiltered.length);
        
        const localActivitiesFormatted = localFiltered.map(a => ({
          id: a.id,
          type: a.activity_type,
          status: a.status || 'submitted',
          date: new Date(a.created_at).toLocaleDateString(),
          points: a.points_impact || 0,
          related_id: a.related_id || null,
          description: a.details?.description || (a.activity_type === 'dumping_report' ? 'Dumping Report' : 'Activity'),
          address: a.details?.location || a.details?.address || '',
          isLocal: true,
          sync_status: a.sync_status || 'pending_sync'
        }));
        
        console.log('[Activity] Formatted local activities:', localActivitiesFormatted);
        return localActivitiesFormatted;
      } catch (le) {
        console.warn('Failed to load local activities', le);
        return [];
      }
    };

    // Define timeout wrapper for network operations
    const fetchWithTimeout = async (operation) => {
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Activity fetch timeout - using cached data instead')), 8000)); // Reduced to 8 seconds
      return Promise.race([operation(), timeout]);
    };
    
    // STEP 1: IMMEDIATELY LOAD AND DISPLAY LOCAL DATA
    try {
      // Load local activities first for immediate display
      const localActivities = loadLocalActivities();
      const localOffset = (currentPage - 1) * itemsPerPage;
      const localTotalPages = Math.ceil(localActivities.length / itemsPerPage) || 1;
      setTotalPages(localTotalPages);
      
      // Show local data immediately
      const localPageSlice = localActivities.slice(localOffset, localOffset + itemsPerPage);
      setActivities(localPageSlice);
      setIsLoading(false);
      
      // If offline or sufficient local data, stop here
      if (isOffline || localActivities.length >= 5) {
        if (isOffline) {
          setError('Showing cached activities (offline)');
        }
        return;
      }
      
      // STEP 2: ENHANCE WITH NETWORK DATA
      setIsLoading(true); // Show loading for network enhancement
      console.log(`Attempting to fetch network activities (attempt ${retryCount + 1} of ${MAX_RETRIES + 1})`);
      
      // Try session refresh if not first attempt
      if (retryCount > 0) {
        const refreshResult = await refreshAndValidateSession();
        if (!refreshResult.success) {
          console.warn('Session refresh failed before fetching activities');
          // Continue anyway and let query handle any auth errors
        }
      }

      // Prepare and execute query with timeout protection
      let query = supabase
        .from('user_activity')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      // Apply filters if not on 'all' tab
      if (filter !== 'all') {
        query = query.eq('activity_type', filter);
      }
      
      // Apply pagination
      query = query.range(offset, offset + itemsPerPage - 1);
      
      // Execute with timeout
      const { data, error: activitiesError } = await fetchWithTimeout(async () => query);
      
      if (activitiesError) {
        console.error('Error fetching activities data:', activitiesError);
        
        // If JWT error, try refresh and signal retry
        if (activitiesError.message && activitiesError.message.includes('JWT')) {
          await refreshAndValidateSession();
          throw new Error('Authentication error, retrying after refresh');
        }
        
        throw activitiesError;
      }
      
      // Format network activities
      const networkActivities = Array.isArray(data) ? data : [];
      console.log('Network activities received:', networkActivities.length);
      
      const formattedNetworkActivities = networkActivities.map(activity => {
        let formattedActivity = {
          id: activity.id,
          type: activity.activity_type,
          status: activity.status || 'submitted',
          date: new Date(activity.created_at).toLocaleDateString(),
          points: activity.points || activity.points_impact || 0,
          related_id: activity.related_id || null,
          description: '',
          address: ''
        };
        
        // Add type-specific details
        if (activity.activity_type === 'pickup_request') {
          formattedActivity.description = activity.details?.waste_type || 'Waste Pickup';
          formattedActivity.address = activity.details?.address || '';
        } 
        else if (activity.activity_type === 'dumping_report') {
          formattedActivity.description = activity.details?.waste_type || 'Dumping Report';
          formattedActivity.address = activity.details?.address || '';
        }
        else if (activity.activity_type === 'qr_scan') {
          formattedActivity.description = 'QR Code Scan';
          formattedActivity.address = activity.details?.location_name || 'Public Bin';
        }
        else if (activity.activity_type === 'reward_redemption') {
          formattedActivity.description = activity.details?.reward_name || 'Reward Redeemed';
          formattedActivity.address = '';
        }
        
        return formattedActivity;
      });
      
      // STEP 3: MERGE LOCAL AND NETWORK DATA
      // Reload local activities to ensure we have latest data
      const refreshedLocalActivities = loadLocalActivities();
      
      // Set up deduplication logic
      const localKeys = new Set(
        refreshedLocalActivities
          .filter(a => a.type && a.related_id)
          .map(a => `${a.type}::${a.related_id}`)
      );
      const seenIds = new Set(refreshedLocalActivities.map(a => a.id));
      
      // Filter network activities to avoid duplicates
      const serverFiltered = formattedNetworkActivities.filter(item => {
        const key = item.type && item.related_id ? `${item.type}::${item.related_id}` : null;
        if (key && localKeys.has(key)) return false; // Local activities take priority
        if (seenIds.has(item.id)) return false; // Avoid duplicate IDs
        return true;
      });
      
      // Combine and update pagination
      const combined = [...refreshedLocalActivities, ...serverFiltered];
      const combinedCount = combined.length;
      const calculatedTotalPages = Math.ceil(combinedCount / itemsPerPage) || 1;
      
      setTotalPages(Math.max(1, calculatedTotalPages));

      // Apply pagination and update UI
      const pageSlice = combined.slice(offset, offset + itemsPerPage);
      setActivities(pageSlice);
      setError('');
            console.log('Enhanced with network data:', { 
        local: refreshedLocalActivities.length,
        server: serverFiltered.length,
        combined: combinedCount,
        totalPages: calculatedTotalPages 
      });
      
    } catch (error) {
      console.warn('Error in activities fetch:', error.message);
      
      // On network failure, make sure we're still showing any local data
      const fallbackLocalActivities = loadLocalActivities();
      
      if (fallbackLocalActivities.length > 0) {
        // We have local data to show as fallback
        const localOffset = (currentPage - 1) * itemsPerPage;
        const localPageSlice = fallbackLocalActivities.slice(localOffset, localOffset + itemsPerPage);
        setActivities(localPageSlice);
        setError('Network unavailable - showing cached activities');
      } else {
        // No local data - consider retry or show error
        if (retryCount < MAX_RETRIES) {
          // Retry with exponential backoff
          const delay = RETRY_DELAY * Math.pow(1.5, retryCount);
          console.log(`Retrying in ${delay}ms (attempt ${retryCount + 1} of ${MAX_RETRIES})...`);
          setTimeout(() => {
            fetchActivities(retryCount + 1);
          }, delay);
          return;
        }
        
        // Out of retries - show appropriate error
        if (error?.message?.includes('timeout')) {
          setError('Connection is slow. Activity data will load when network improves.');
        } else {
          setError('Unable to load activity history. Please check your connection.');
        }
        
        // Show empty state after all retries failed
        setActivities([]);
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  // Use the fetchActivities function in useEffect
  useEffect(() => {
    fetchActivities(0);
  }, [user?.id, filter, currentPage]);

  // Listen to storage changes (e.g., other tabs) for userActivity updates
  useEffect(() => {
    const onStorage = (e) => {
      if (!e) return;
      if (!user) return;
      if (e.key === `userActivity_${user.id}`) {
        fetchActivities(0);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user?.id]);
  // Listen for local activity events to refresh immediately
  useEffect(() => {
    const onLocalActivity = (e) => {
      try {
        const detailUserId = e?.detail?.userId;
        if (!user || (detailUserId && detailUserId !== user.id)) return;
        fetchActivities(0);
      } catch (_) {}
    };
    window.addEventListener('local-activity', onLocalActivity);
    return () => window.removeEventListener('local-activity', onLocalActivity);
  }, [user?.id]);

  // Manual refresh handler
  const handleRefresh = () => {
    console.log('Manual refresh triggered');
    setIsLoading(true);
    setError('');
    // Directly call fetchActivities instead of relying on the useEffect
    fetchActivities();
  };

  // Handle filter change
  const handleFilterChange = (newFilter) => {
    console.log('Filter changed to:', newFilter);
    setFilter(newFilter);
    setCurrentPage(1);
  };

  // Handle page change
  const handlePageChange = (newPage) => {
    console.log('Page changed to:', newPage, 'of', totalPages);
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
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
  
  // Simple pagination component
  const Pagination = ({ currentPage, totalPages, onPageChange }) => {
    if (totalPages <= 1) return null;
    
    return (
      <div className="flex justify-center items-center space-x-2">
        <button 
          className="p-2 rounded-md bg-gray-100 dark:bg-gray-700 disabled:opacity-50"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          &laquo;
        </button>
        
        <span className="text-gray-700 dark:text-gray-300">
          Page {currentPage} of {totalPages}
        </span>
        
        <button 
          className="p-2 rounded-md bg-gray-100 dark:bg-gray-700 disabled:opacity-50"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          &raquo;
        </button>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-100">Activity History</h1>
      
      {/* Filter tabs */}
      <div className="flex flex-wrap mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden border border-gray-200 dark:border-gray-700">
        <button 
          className={`px-4 py-3 flex-1 text-center ${filter === 'all' ? 'bg-primary text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          onClick={() => handleFilterChange('all')}
        >
          All
        </button>
        <button 
          className={`px-4 py-3 flex-1 text-center ${filter === 'pickup_request' ? 'bg-primary text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          onClick={() => handleFilterChange('pickup_request')}
        >
          Pickups
        </button>
        <button 
          className={`px-4 py-3 flex-1 text-center ${filter === 'dumping_report' ? 'bg-primary text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          onClick={() => handleFilterChange('dumping_report')}
        >
          Reports
        </button>
        <button 
          className={`px-4 py-3 flex-1 text-center ${filter === 'qr_scan' ? 'bg-primary text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          onClick={() => handleFilterChange('qr_scan')}
        >
          Scans
        </button>
        <button 
          className={`px-4 py-3 flex-1 text-center ${filter === 'reward_redemption' ? 'bg-primary text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          onClick={() => handleFilterChange('reward_redemption')}
        >
          Rewards
        </button>
        <button 
          onClick={handleRefresh}
          className="px-4 py-3 text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 flex items-center justify-center"
          aria-label="Refresh activity data"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
        </button>
      </div>
      
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
            activities.map(activity => (
              <ActivityCard key={activity.id} activity={activity} />
            ))
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
          
          {/* Pagination */}
          {activities.length > 0 && totalPages > 1 && (
            <div className="mt-6">
              <Pagination 
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Activity;
