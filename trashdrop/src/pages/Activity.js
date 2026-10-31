import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.js';
import supabase from '../utils/supabaseClient.js';
import LoadingSpinner from '../components/LoadingSpinner.js';
import { reportPoints, reportPointsPending } from '../utils/reportPoints.js';
import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader.js';
import { card, errorNote, secondaryButton, tonalButton } from '../components/ui/styles.js';

// Title, icon and tint for each kind of activity (reports orange, as on the dashboard)
const GREEN = 'bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300';
const BIN = 'M4 7h16M6 7l1 13h10l1-13M10 11v5M14 11v5M9 7V4h6v3';
const ACTIVITY_KINDS = {
  pickup_request: { title: 'Waste Pickup', tint: GREEN, d: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 18a2 2 0 100 .01M17 18a2 2 0 100 .01' },
  dumping_report: { title: 'Dumping Report', tint: 'bg-orange-100 text-td-orange-text dark:bg-orange-900/40 dark:text-orange-300', d: 'M12 3l9 16H3zM12 10v4M12 17v.01' },
  qr_scan: { title: 'QR Code Scan', tint: GREEN, d: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3' },
  digital_bin: { title: 'Request Bin Pickup', tint: GREEN, d: BIN },
  reward_redemption: { title: 'Reward Redemption', tint: GREEN, d: 'M12 3a6 6 0 100 12 6 6 0 000-12zM9 14l-2 7 5-3 5 3-2-7' },
  other: { title: 'Reward Redemption', tint: GREEN, d: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 3' },
};

// Status chips: done in green, under way in amber, stopped in grey
const DONE = 'bg-td-tonal text-td-forest-dk dark:bg-green-900/50 dark:text-green-200';
const WAITING = 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200';
const STOPPED = 'bg-gray-200 text-td-ink dark:bg-gray-600 dark:text-gray-100';
const STATUS_TINTS = {
  completed: DONE, disposed: DONE, verified: DONE, collected: DONE, sent: DONE,
  pending: WAITING, scheduled: WAITING, accepted: WAITING, in_progress: WAITING, en_route: WAITING, pending_verification: WAITING,
  cancelled: STOPPED, canceled: STOPPED, rejected: STOPPED,
};

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
    pickup_requests: null,
    digital_bins: null,
    batches: null
  });
  const itemsPerPage = 20; // Increased for better infinite scroll experience
  const mountedRef = useRef(true);
  const observerRef = useRef(null);
  const loadingRef = useRef(null);
  const cursorsRef = useRef({ user_activity: null, illegal_dumping_mobile: null, pickup_requests: null, digital_bins: null, batches: null });

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
      setCursors({ user_activity: null, illegal_dumping_mobile: null, pickup_requests: null, digital_bins: null, batches: null });
      cursorsRef.current = { user_activity: null, illegal_dumping_mobile: null, pickup_requests: null, digital_bins: null, batches: null };
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
        // Fetch from all four tables with cursor-based pagination
        const itemsPerTable = Math.ceil(itemsPerPage / 4);
        
        const [activityResult, dumpingResult, pickupResult, digitalBinResult] = await Promise.allSettled([
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
          }),
          // Digital bins query
          fetchWithTimeout(async () => {
            let query = supabase
              .from('digital_bins')
              .select('*, bin_locations:location_id(location_name, address)')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(itemsPerTable);
              
            if (cursorsRef.current.digital_bins) {
              query = query.lt('created_at', cursorsRef.current.digital_bins);
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
        
        // Process digital bins results
        if (digitalBinResult.status === 'fulfilled' && digitalBinResult.value?.data) {
          const activities = digitalBinResult.value.data.map(item => ({ ...item, _source: 'digital_bins' }));
          allTableActivities = [...allTableActivities, ...activities];
          if (activities.length > 0) {
            newCursors.digital_bins = activities[activities.length - 1].created_at;
            hasMore = hasMore || activities.length === itemsPerTable;
          }
        }
        
        // Sort all activities by created_at
        allTableActivities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        newActivities = allTableActivities.slice(0, itemsPerPage);
        
      } else if (filter === 'pickup_request') {
        // Query both pickup requests AND digital bins (both are types of pickups)
        const itemsPerTable = Math.ceil(itemsPerPage / 2); // Split between two tables
        
        const [pickupResult, digitalBinResult] = await Promise.allSettled([
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
          }),
          // Digital bins query
          fetchWithTimeout(async () => {
            let query = supabase
              .from('digital_bins')
              .select('*, bin_locations:location_id(location_name, address)')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(itemsPerTable);
              
            if (cursorsRef.current.digital_bins) {
              query = query.lt('created_at', cursorsRef.current.digital_bins);
            }
            
            return query;
          })
        ]);
        
        let allPickupActivities = [];
        
        // Process pickup requests results
        if (pickupResult.status === 'fulfilled' && pickupResult.value?.data) {
          const activities = pickupResult.value.data.map(item => ({ ...item, _source: 'pickup_requests' }));
          allPickupActivities = [...allPickupActivities, ...activities];
          if (activities.length > 0) {
            newCursors.pickup_requests = activities[activities.length - 1].created_at;
            hasMore = hasMore || activities.length === itemsPerTable;
          }
        }
        
        // Process digital bins results
        if (digitalBinResult.status === 'fulfilled' && digitalBinResult.value?.data) {
          const activities = digitalBinResult.value.data.map(item => ({ ...item, _source: 'digital_bins' }));
          allPickupActivities = [...allPickupActivities, ...activities];
          if (activities.length > 0) {
            newCursors.digital_bins = activities[activities.length - 1].created_at;
            hasMore = hasMore || activities.length === itemsPerTable;
          }
        }
        
        // Sort all pickup-related activities by date
        allPickupActivities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        newActivities = allPickupActivities.slice(0, itemsPerPage);
        
      } else if (filter === 'qr_scan') {
        // Fetch scan-related activity from batches table for current user
        let query = supabase
          .from('batches')
          .select('*')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(itemsPerPage);

        if (cursorsRef.current.batches) {
          query = query.lt('created_at', cursorsRef.current.batches);
        }

        const { data: batchData, error: batchError } = await fetchWithTimeout(async () => query);

        if (batchError) {
          console.error('Error fetching batch scan activities:', batchError);
          throw batchError;
        }

        newActivities = (batchData || []).map(item => ({ ...item, _source: 'batches' }));
        hasMore = newActivities.length === itemsPerPage;

        if (newActivities.length > 0) {
          newCursors.batches = newActivities[newActivities.length - 1].created_at;
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
      
      // Only text can be shown as an address: pickup_requests.location is a
      // map geometry, which the API returns as an object, and rendering that
      // crashed the page (React error #31)
      const asText = (...values) => values.find(v => typeof v === 'string' && v.trim()) || null;

      // Format activities
      const formattedActivities = newActivities.map(activity => {
        let formattedActivity;
        
        if (activity._source === 'illegal_dumping_mobile') {
          formattedActivity = {
            id: activity.id,
            type: 'dumping_report',
            status: activity.status || 'submitted',
            date: new Date(activity.created_at).toLocaleDateString(),
            // Earned once the team verifies the report (utils/reportPoints)
            points: reportPoints(activity),
            pointsPending: reportPointsPending(activity),
            related_id: activity.id,
            description: `Reported ${activity.waste_type || 'illegal dumping'} (${activity.severity || 'medium'} severity)`,
            address: asText(activity.location) || 'Unknown location',
            created_at: activity.created_at
          };
        } else if (activity._source === 'pickup_requests') {
          formattedActivity = {
            id: activity.id,
            type: 'pickup_request',
            status: activity.status || 'submitted',
            date: new Date(activity.created_at).toLocaleDateString(),
            points: activity.points_earned || 0,
            related_id: activity.id,
            description: `${activity.waste_type || 'Waste'} Pickup - ${activity.estimated_volume || activity.bag_count || 1} bag(s)`,
            address: asText(activity.address, activity.location) || 'Custom location',
            created_at: activity.created_at
          };
        } else if (activity._source === 'digital_bins') {
          const locationName = activity.bin_locations?.location_name || 'Unknown location';
          const statusText = activity.is_active ? 'active' : 'inactive';
          const isExpired = new Date(activity.expires_at) < new Date();
          const finalStatus = isExpired ? 'expired' : statusText;
          
          formattedActivity = {
            id: activity.id,
            type: 'digital_bin',
            status: finalStatus,
            date: new Date(activity.created_at).toLocaleDateString(),
            points: 15, // Digital bins earn 15 points
            related_id: activity.id,
            description: `Request Bin Pickup (${activity.frequency})`,
            address: locationName,
            created_at: activity.created_at
          };
        } else if (activity._source === 'batches') {
          const batchNumber = activity.batch_number || activity.code || activity.id;
          const bagCount = Number(activity.bag_count || activity.total_bags || 0);

          formattedActivity = {
            id: activity.id,
            type: 'qr_scan',
            status: activity.status || 'activated',
            date: new Date(activity.created_at).toLocaleDateString(),
            points: 0,
            related_id: activity.id,
            description: `Activated batch ${batchNumber}${bagCount ? ` - ${bagCount} bag(s)` : ''}`,
            address: asText(activity.distribution_center, activity.location) || 'Batch activation',
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
            formattedActivity.address = asText(activity.details?.location_name) || 'Public Bin';
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
    const resetCursors = { user_activity: null, illegal_dumping_mobile: null, pickup_requests: null, digital_bins: null };
    setCursors(resetCursors);
    cursorsRef.current = resetCursors;
    setActivities([]);
    setHasMoreData(true);
  };

  // Activity row component, in the dashboard's Recent Activity style
  const ActivityCard = ({ activity, first }) => {
    const kind = ACTIVITY_KINDS[activity.type] || ACTIVITY_KINDS.other;
    const points = Number(activity.points) || 0;
    const status = String(activity.status || '');

    return (
      <li className={`flex items-start gap-3 py-3.5 ${first ? '' : 'border-t border-td-border dark:border-gray-700'}`}>
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${kind.tint}`} aria-hidden="true">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d={kind.d} />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[15px] font-semibold text-td-ink dark:text-gray-100 leading-snug">{kind.title}</h3>
            {activity.pointsPending ? (
              <span className="flex-shrink-0 max-w-[6rem] text-right text-[13px] text-td-sage dark:text-gray-300">Points when verified</span>
            ) : points !== 0 && (
              <span className={`flex-shrink-0 text-[15px] font-bold ${points > 0 ? 'text-td-forest dark:text-green-300' : 'text-td-ink dark:text-gray-100'}`}>
                {points > 0 ? '+' : '−'}{Math.abs(points).toLocaleString()}
                <span className="sr-only"> points</span>
              </span>
            )}
          </div>
          <p className="text-[13px] text-td-sage dark:text-gray-300 mt-0.5">
            {activity.date} • {activity.description}
          </p>
          {activity.address && (
            <p className="text-[13px] text-td-sage dark:text-gray-300 flex items-center mt-0.5">
              <svg className="w-3.5 h-3.5 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">{activity.address}</span>
            </p>
          )}
          {(status || (activity.isLocal && activity.sync_status === 'pending_sync')) && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {status && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_TINTS[status] || 'bg-td-cream text-td-ink dark:bg-gray-700 dark:text-gray-200'}`}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
              )}
              {activity.isLocal && activity.sync_status === 'pending_sync' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                  Pending Sync
                </span>
              )}
            </div>
          )}
        </div>
      </li>
    );
  };

  // Loading indicator for infinite scroll
  const InfiniteScrollLoader = () => {
    if (!hasMoreData) {
      return (
        <p className="text-center py-4 text-[13px] text-td-sage dark:text-gray-300 border-t border-td-border dark:border-gray-700">
          No more activities to load
        </p>
      );
    }

    if (isLoadingMore) {
      return (
        <div className="flex justify-center items-center py-4 border-t border-td-border dark:border-gray-700">
          <LoadingSpinner />
          <span className="ml-2 text-[13px] text-td-sage dark:text-gray-300">Loading more activities...</span>
        </div>
      );
    }

    return (
      <p className="text-center py-4 text-[13px] text-td-sage dark:text-gray-300 border-t border-td-border dark:border-gray-700">
        Scroll down to load more activities
      </p>
    );
  };

  const FILTERS = [
    ['all', 'All'],
    ['pickup_request', 'Pickups'],
    ['dumping_report', 'Reports'],
    ['qr_scan', 'Scans'],
  ];

  return (
    <div className="max-w-3xl mx-auto px-2 pb-24">
      <PageHeader title="Activity History" subtitle="Every pickup, report, scan and redemption, newest first." />

      {/* Filters - stay in view while scrolling */}
      <div className="sticky top-16 md:top-14 z-10 -mx-2 px-2 py-3 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2" role="group" aria-label="Show">
          <div className="flex-1 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {FILTERS.map(([value, label]) => (
              <button
                key={value}
                onClick={() => handleFilterChange(value)}
                aria-pressed={filter === value}
                className={`h-9 px-4 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                  filter === value
                    ? 'bg-td-forest text-white'
                    : 'bg-td-tonal text-td-forest-dk hover:bg-[#d5eadb] dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={handleRefresh}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border border-td-border dark:border-gray-600 text-td-forest dark:text-green-300 hover:bg-td-cream dark:hover:bg-gray-800"
            aria-label="Refresh activity data"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex justify-center items-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className={`${errorNote} px-4 py-3`} role="alert">
          <p className="text-[15px]"><strong className="font-bold">Error: </strong>{error}</p>
          <button onClick={handleRefresh} className={`${secondaryButton} h-10 mt-3 bg-white dark:bg-transparent`}>
            Try Again
          </button>
        </div>
      )}

      {/* Activity list */}
      {!isLoading && !error && (
        activities.length > 0 ? (
          <section aria-label="Activities" className={`${card} px-4 pt-0.5`}>
            <ul>
              {activities.map((activity, i) => (
                <ActivityCard key={`${activity.id}-${activity.created_at}`} activity={activity} first={i === 0} />
              ))}
            </ul>

            {/* Infinite scroll loading indicator */}
            <div ref={loadingRef}>
              <InfiniteScrollLoader />
            </div>
          </section>
        ) : (
          <section className={`${card} px-5 py-8 text-center`}>
            <span className="inline-flex w-14 h-14 rounded-2xl bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300 items-center justify-center mb-3" aria-hidden="true">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
            </span>
            <h2 className="text-[17px] font-bold text-td-ink dark:text-gray-100">No activity yet</h2>
            <p className="text-[15px] text-td-sage dark:text-gray-300 mt-1">Your activity history will appear here as you use the app.</p>
            <p className="text-sm text-td-sage dark:text-gray-300 mt-5 mb-2">Try these activities to get started:</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/pickup-request" className={tonalButton}>Request a trash pickup</Link>
              <Link to="/report" className={tonalButton}>Report illegal dumping</Link>
              <Link to="/qr-scanner" className={tonalButton}>Scan a bag QR code</Link>
            </div>
          </section>
        )
      )}
    </div>
  );
};

export default Activity;
