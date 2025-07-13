import React, { useState, useEffect, useContext } from 'react';
import appConfig from '../utils/app-config.js';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import LoadingSpinner from '../components/LoadingSpinner.js';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import ActivePickupCard from '../components/ActivePickupCard.js';
import supabase from '../utils/supabaseClient.js';

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
  const [dropPoints, setDropPoints] = useState([]);
  const [activePickup, setActivePickup] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // Enhanced session refresh function with validation
    const refreshAndValidateSession = async () => {
      // Special case for our test account
      if (user && user.email === 'prince02@mailinator.com') {
        console.log('Using test account - skipping session refresh');
        return { success: true, testAccount: true };
      }
      
      // Skip real session refresh in development mode with mocks enabled
      if (appConfig && appConfig.features && appConfig.features.enableMocks) {
        console.log('Development mode with mocks enabled - skipping real session refresh');
        return { success: true, mock: true };
      }
      
      try {
        // Check if we have a session already before trying to refresh
        const currentSession = supabase.auth.session && supabase.auth.session() || null;
        if (!currentSession) {
          console.log('No existing session found, skipping refresh');
          return { success: true, noSession: true };
        }
        
        console.log('Attempting to refresh session for dashboard data');
        const { data, error } = await supabase.auth.refreshSession();
        
        if (error) {
          // Handle common session missing error gracefully - check for multiple possible error messages
          if (error.message === 'Auth session missing!' || 
              error.message?.includes('missing') ||
              error.message?.includes('not found') ||
              error.message?.includes('invalid') ||
              error.status === 401) {
            console.log('Auth session issue detected - this is normal for test accounts or in development mode');
            return { success: true, noSession: true };
          }
          
          console.warn('Session refresh failed in Dashboard component:', error.message);
          // Even with error, return success to continue loading data
          return { success: true, noSession: true, error };
        }
        
        if (!data?.session) {
          console.warn('Session refresh did not return a valid session in Dashboard component');
          return { success: true, noSession: true }; 
        }
        
        console.log('Session refreshed successfully in Dashboard component');
        return { success: true, session: data.session };
      } catch (err) {
        console.error('Error during session refresh in Dashboard component:', err);
        return { success: true, noSession: true, error: err };
      }
    };
    
    // Retry operation with timeout and exponential backoff
    const retryOperation = async (operation, maxRetries = 2, initialDelay = 500) => {
      let retries = 0;
      let lastError = null;
      
      while (retries <= maxRetries) {
        try {
          // Add a timeout wrapper around the operation
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Dashboard operation timeout')), 10000));
          
          const result = await Promise.race([
            operation(),
            timeoutPromise
          ]);
          
          return result;
        } catch (err) {
          console.warn(`Dashboard operation failed (attempt ${retries + 1}/${maxRetries + 1}):`, err);
          lastError = err;
          
          // If this is the last retry, don't delay, just throw
          if (retries === maxRetries) {
            throw lastError;
          }
          
          // If this is a token error, try refreshing immediately
          if (err.message && (
            err.message.includes('JWT') || 
            err.message.includes('auth') ||
            err.message.includes('token')
          )) {
            await refreshAndValidateSession();
          }
          
          // Add delay with exponential backoff
          const delay = initialDelay * Math.pow(2, retries);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
        }
      }
    };

    // Access to structured mock data from mocks directory
    
    // Fetch user data including stats and recent activity with enhanced error handling
    const fetchUserData = async () => {
      setIsLoading(true);
      
      if (!user) {
        console.log('No user found, cannot fetch user data');
        setIsLoading(false);
        return;
      }
      
      // Mocks have been removed
      const useMocks = false;
      
      try {
        // Always attempt to refresh session first
        {
          const sessionResult = await refreshAndValidateSession();
          
          if (sessionResult.noSession) {
            console.log('No active session but continuing with data load');
            // Continue with whatever data we can get
          }
        }
        
        // Continue with the rest of the function regardless of session status
        
        // Fetch user stats from Supabase with explicit schema
        const { data: statsData, error: statsError } = await retryOperation(async () => {
          return await supabase
            .from('user_stats')
            .select('*', { schema: 'public' })
            .eq('user_id', user.id)
            .maybeSingle(); // Use maybeSingle instead of single to handle the no-rows case
        });
        
        if (statsError) {
          if (statsError.code === '22P02') {
            // Invalid UUID format - should be fixed now, but handle gracefully
            console.warn('Invalid UUID format for user_id. This should be fixed after refresh.');
          } else if (statsError.code === '42P01') {
            // Table doesn't exist - expected in dev/test environment with mocks
            console.warn('user_stats table does not exist. This is normal in the dev environment with mocks enabled.');
          } else if (statsError.code === 'PGRST116') {
            // No rows found - this is expected for new users
            console.log('No stats found for user. This is normal for new users.');
            // Continue to mocks or default values
          } else {
            console.error('Error fetching user stats:', statsError);
          }
          
          // Set default values for stats
          setStats({
            points: 0,
            pickups: 0,
            reports: 0,
            batches: 0,
            totalBags: 0,
          });
          // Don't throw, continue with default values
        } else if (statsData) {
          setStats({
            points: statsData.total_points || 0,
            pickups: statsData.total_pickups || 0,
            reports: statsData.total_reports || 0,
            batches: statsData.total_batches || 0,
            totalBags: statsData.total_bags || 0,
          });
        }
        
        // Fetch recent activity from Supabase with explicit schema
        const { data: activityData, error: activityError } = await retryOperation(async () => {
          return await supabase
            .from('user_activity')
            .select('*', { schema: 'public' })
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(3);
        });
        
        if (activityError) {
          if (activityError.code === '22P02') {
            // Invalid UUID format - should be fixed now, but handle gracefully
            console.warn('Invalid UUID format for user_id in recent activity. This should be fixed after refresh.');
          } else if (activityError.code === '42P01') {
            // Table doesn't exist - expected in dev/test environment with mocks
            console.warn('user_activity table does not exist. This is normal in the dev environment with mocks enabled.');
          } else {
            console.error('Error fetching recent activity:', activityError);
          }
          
          // Set empty array for activity
          setRecentActivity([]);
          // Don't throw, continue with empty activity
        }
        
        if (activityData && activityData.length > 0) {
          setRecentActivity(activityData.map(activity => ({
            id: activity.id,
            type: activity.activity_type,
            status: activity.status,
            date: activity.created_at,
            points: activity.points || 0
          })));
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setIsLoading(false);
      }
    };
    
    fetchUserData();
    
    // Fetch active pickup from supabase
    const fetchActivePickup = async () => {
      if (user && user.id) {
        try {
          // Check session storage first for cached active pickup status
          const sessionActivePickup = sessionStorage.getItem(`activePickup_${user.id}`);
          const cachedPickup = sessionActivePickup ? JSON.parse(sessionActivePickup) : null;
          
          // Always fetch from Supabase to ensure data is fresh
          // No more mock data
          
          try {
            const { data, error } = await retryOperation(async () => {
              return await supabase
                .from('pickups')
                .select('*', { schema: 'public' })
                .eq('user_id', user.id)
                .in('status', ['waiting_for_collector', 'collector_assigned', 'en_route', 'arrived'])
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            });
            
            if (error) {
              if (error.code === 'PGRST116') {
                // No active pickup found, this is not an error
                return;
              } else if (error.code === '42P01' || error.status === 404) {
              // Table doesn't exist - this is expected in dev/test environment with mocks enabled
              console.warn('Pickups table does not exist. This is normal in the dev environment with mocks enabled.');
              // Use cached pickup if available, otherwise use mock data if mocks are enabled
              if (cachedPickup) {
                setActivePickup(cachedPickup);

              }
              return;
            }
            console.error('Error fetching active pickup:', error);
            // Don't throw, continue with no active pickup
            return;
          }
          
          if (data) {
            // Format pickup data for the card
            const formattedPickup = {
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
              distance: data.distance,
              created_at: data.created_at,
              updated_at: data.updated_at
            };
            
            setActivePickup(formattedPickup);
            
            // Save to session storage for persistence across page reloads
            sessionStorage.setItem(`activePickup_${user.id}`, JSON.stringify(formattedPickup));
          } else {
            // No active pickup found in database
            setActivePickup(null);
            // Clear from session storage
            sessionStorage.removeItem(`activePickup_${user.id}`);
          }
          } catch (supabaseError) {
            console.error('Error with Supabase pickups query:', supabaseError);
            // Use cached pickup if available
            if (cachedPickup) {
              console.log('Using cached pickup data');
              setActivePickup(cachedPickup);
            }
          }
        } catch (error) {
          console.error('Error fetching active pickup:', error);
          setActivePickup(null);
        }
      }
    };
    
    // Call the function to fetch active pickup
    fetchActivePickup();
    
    // Set up real-time subscription for pickup status changes
    const setupPickupSubscription = async () => {
      if (user && user.id) {
        // Subscribe to changes in the pickups table for this user
        const pickupSubscription = supabase
          .channel('pickup-changes')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'pickups', filter: `user_id=eq.${user.id}` },
            (payload) => {
              console.log('Pickup update received:', payload);
              
              // If the pickup status was changed to completed or cancelled, remove from active pickup
              if (payload.new && (payload.new.status === 'completed' || payload.new.status === 'cancelled')) {
                setActivePickup(null);
                sessionStorage.removeItem(`activePickup_${user.id}`);
              } else if (payload.new) {
                // Update the active pickup with new data
                fetchActivePickup();
              }
            }
          )
          .subscribe();
          
        return () => {
          pickupSubscription.unsubscribe();
        };
      }
    };
    
    // Setup the subscription
    const unsubscribe = setupPickupSubscription();
    
  }, [user]);
  
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28 md:pb-6">
      {/* User Stats Card */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
        
        {/* Stats cards - horizontal scroll on mobile, grid on desktop */}
        <div className="flex md:grid md:grid-cols-4 gap-4 mb-6 overflow-x-auto pb-4 snap-x snap-mandatory scroll-pl-6 touch-pan-x">
          <div className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-lg relative overflow-hidden md:min-w-0 min-w-[280px] flex-shrink-0 md:flex-1 snap-center">
            <div className="flex justify-between items-center">
              <h3 className="text-sm md:text-lg font-semibold text-purple-700 dark:text-purple-300">Batches & Bags</h3>
              <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full">Lv {Math.floor(stats.batches / 2) + 1}</span>
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
                style={{ width: `${(stats.batches % 2) * 50}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <p className="text-purple-600 dark:text-purple-300">{2 - (stats.batches % 2)} more to level up</p>
              <p className="text-indigo-600 dark:text-indigo-300">
                {stats.totalBags > 0 ? `${stats.totalBags} bags available` : "No bags available"}
              </p>
            </div>
          </div>

          <div className="bg-green-50 dark:bg-green-900/30 p-3 rounded-lg relative overflow-hidden md:min-w-0 min-w-[280px] flex-shrink-0 md:flex-1 snap-center">
            <div className="flex justify-between items-center">
              <h3 className="text-sm md:text-lg font-semibold text-green-700 dark:text-green-300">Pickups</h3>
              <span className="bg-green-600 text-white text-xs px-2 py-1 rounded-full">Lv {Math.floor(stats.pickups / 5) + 1}</span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-green-800 dark:text-green-200">{stats.pickups}</p>
            {/* Progress bar */}
            <div className="w-full h-2 bg-green-200 dark:bg-green-700 rounded-full mt-2">
              <div 
                className="h-2 bg-green-600 dark:bg-green-400 rounded-full" 
                style={{ width: `${(stats.pickups % 5) * 20}%` }}
              ></div>
            </div>
            <p className="text-xs text-green-600 dark:text-green-300 mt-1">{5 - (stats.pickups % 5)} more to level up</p>
            {/* Achievement badge */}
            {stats.pickups >= 5 && (
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
              <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">Lv {Math.floor(stats.points / 100) + 1}</span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-blue-800 dark:text-blue-200">{stats.points}</p>
            {/* Progress bar */}
            <div className="w-full h-2 bg-blue-200 dark:bg-blue-700 rounded-full mt-2">
              <div 
                className="h-2 bg-blue-600 dark:bg-blue-400 rounded-full" 
                style={{ width: `${(stats.points % 100)}%` }}
              ></div>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">{100 - (stats.points % 100)} points to next level</p>
            {/* Badge */}
            {stats.points >= 250 && (
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
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
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
    </div>
  );
};

export default Dashboard;
