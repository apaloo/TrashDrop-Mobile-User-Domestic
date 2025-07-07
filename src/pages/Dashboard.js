import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import appConfig from '../utils/app-config';
import ActivePickupCard from '../components/ActivePickupCard';
import { supabase } from '../utils/supabaseClient';

/**
 * Dashboard page component showing user's activity and nearby trash drop points
 */
const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    points: 0,
    pickups: 0,
    reports: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [dropPoints, setDropPoints] = useState([]);
  const [activePickup, setActivePickup] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // Fetch user stats, activities and active pickup
    const fetchUserData = async () => {
      setIsLoading(true);
      
      try {
        // In a real app, these would be API calls
        // Mock data for development
        setTimeout(() => {
          setStats({
            points: 250,
            pickups: 5,
            reports: 3,
          });
          
          setRecentActivity([
            { id: 1, type: 'pickup', status: 'completed', date: '2025-07-01', points: 50 },
            { id: 2, type: 'report', status: 'verified', date: '2025-06-28', points: 30 },
            { id: 3, type: 'pickup', status: 'scheduled', date: '2025-07-10', points: 0 },
          ]);
          
          // Create mock active pickup request matching the screenshot
          setActivePickup({
            id: 'pickup-123',
            status: 'waiting_for_collector',
            collector_id: 'collector-456',
            collector_name: 'John (Demo)',
            location: [37.7749, -122.4194], // NYC coordinates from the screenshot
            address: '123 Main St, New York, NY',
            waste_type: 'Mixed Recyclables',
            number_of_bags: '2',
            points: 0,
            eta_minutes: null,
            distance: null,
            // Coordinates will be slightly offset for the collector
            collector_location: [37.7649, -122.4294] 
          });
          
          setIsLoading(false);
        }, 1000);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setIsLoading(false);
      }
    };
    
    fetchUserData();
    
    // In a real application, we would fetch active pickup from supabase
    const fetchActivePickup = async () => {
      if (user && user.id) {
        try {
          // This is commented out since we're using mock data for now
          /* 
          const { data, error } = await supabase
            .from('pickups')
            .select('*')
            .eq('user_id', user.id)
            .in('status', ['waiting_for_collector', 'collector_assigned', 'en_route', 'arrived'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
            
          if (error) throw error;
          
          if (data) {
            // Format pickup data for the card
            setActivePickup({
              id: data.id,
              status: data.status,
              collector_id: data.collector_id,
              collector_name: data.collector_name || 'John (Demo)',
              location: data.location,
              address: data.address,
              waste_type: data.waste_type,
              number_of_bags: data.number_of_bags,
              points: data.points || 0,
              eta_minutes: data.eta_minutes,
              distance: data.distance
            });
          }
          */
        } catch (error) {
          console.error('Error fetching active pickup:', error);
        }
      }
    };
    
    // Uncomment this for real implementation
    // fetchActivePickup();
    
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
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        
        {/* User stats with gamification elements */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg relative overflow-hidden">
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
          
          <div className="bg-green-50 dark:bg-green-900/30 p-3 rounded-lg relative overflow-hidden">
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
          
          <div className="bg-yellow-50 dark:bg-yellow-900/30 p-3 rounded-lg relative overflow-hidden">
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
        <div className="flex flex-wrap gap-2 mb-4">
          <Link 
            to="/schedule-pickup" 
            className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-dark transition-colors"
          >
            Schedule Pickup
          </Link>
          
          <Link 
            to="/report" 
            className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600 transition-colors"
          >
            Report Dumping
          </Link>
          
          <Link 
            to="/rewards" 
            className="bg-yellow-500 text-white px-4 py-2 rounded-md hover:bg-yellow-600 transition-colors"
          >
            View Rewards
          </Link>
        </div>
      </div>
      
      {/* Recent activity */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
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
            setActivePickup(null);
            // In a real app, we'd call supabase to update the status
            /*
            supabase
              .from('pickups')
              .update({ status: 'cancelled', updated_at: new Date().toISOString() })
              .eq('id', pickupId)
              .then(({ error }) => {
                if (error) {
                  console.error('Error cancelling pickup:', error);
                } else {
                  setActivePickup(null);
                }
              });
            */
          }}
          onRefresh={() => {
            // Handle refresh pickup data
            console.log('Refreshing pickup data');
            // In a real app, we'd fetch updated data from supabase
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;
