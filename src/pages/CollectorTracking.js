import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import CollectorMap from '../components/CollectorMap.js';
import { pickupService } from '../services/pickupService.js';

/**
 * Collector Tracking page
 * Shows real-time collector locations and tracks active pickup requests
 */
const CollectorTracking = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [activePickup, setActivePickup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collectorLocation, setCollectorLocation] = useState(null);
  
  // Get pickup ID from URL params if provided
  const pickupId = searchParams.get('pickupId');

  // Fetch active pickup details
  useEffect(() => {
    const fetchActivePickup = async () => {
      if (!user?.id) return;

      try {
        setLoading(true);
        let pickup = null;

        if (pickupId) {
          // Fetch specific pickup by ID
          const { data: pickupData, error: pickupError } = await pickupService.getPickupDetails(pickupId);
          if (pickupError) throw new Error(pickupError.message);
          pickup = pickupData;
        } else {
          // Fetch user's active pickup
          const { data: activePickupData, error: activeError } = await pickupService.getActivePickup(user.id);
          if (activeError) throw new Error(activeError.message);
          pickup = activePickupData;
        }

        setActivePickup(pickup);
      } catch (err) {
        console.error('Error fetching pickup:', err);
        setError('Failed to load pickup details');
      } finally {
        setLoading(false);
      }
    };

    fetchActivePickup();
  }, [user, pickupId]);

  const handleCollectorLocationUpdate = (location) => {
    setCollectorLocation(location);
    console.log('Collector location updated:', location);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center text-primary hover:text-primary-dark transition-colors mb-4"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
          
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {user?.is_collector ? 'Collector Dashboard' : 'Track Your Pickup'}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {user?.is_collector 
                ? 'See nearby pickups and manage your collector session'
                : 'Track nearby collectors and your active pickup requests'
              }
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Active Pickup Details */}
        {activePickup && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {user?.is_collector ? 'Assigned Pickup' : 'Your Active Pickup'}
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Location</p>
                <p className="font-medium text-gray-900 dark:text-white">{activePickup.location}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Status</p>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  activePickup.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                  activePickup.status === 'accepted' ? 'bg-blue-100 text-blue-800' :
                  activePickup.status === 'in_transit' ? 'bg-purple-100 text-purple-800' :
                  activePickup.status === 'completed' ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {activePickup.status.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Waste Type</p>
                <p className="font-medium text-gray-900 dark:text-white">{activePickup.waste_type}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Bag Count</p>
                <p className="font-medium text-gray-900 dark:text-white">{activePickup.bag_count}</p>
              </div>
            </div>
            {activePickup.special_instructions && (
              <div className="mt-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Special Instructions</p>
                <p className="font-medium text-gray-900 dark:text-white">{activePickup.special_instructions}</p>
              </div>
            )}
          </div>
        )}

        {/* Collector Map */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <CollectorMap 
            pickupLocation={activePickup?.coordinates}
            onCollectorLocationUpdate={handleCollectorLocationUpdate}
          />
        </div>

        {/* Collector Status */}
        {user?.is_collector && collectorLocation && (
          <div className="mt-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-green-800 dark:text-green-200">
                Your collector session is active and your location is being tracked
              </p>
            </div>
          </div>
        )}

        {/* No Active Pickup Message */}
        {!activePickup && !loading && (
          <div className="text-center py-8">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {user?.is_collector ? 'No Assigned Pickups' : 'No Active Pickup'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {user?.is_collector 
                ? 'You currently have no pickup requests assigned to you.'
                : 'You don\'t have any active pickup requests. Schedule one to track collectors in your area.'
              }
            </p>
            {!user?.is_collector && (
              <button
                onClick={() => navigate('/digital-bin')}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                Schedule a Pickup
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CollectorTracking;
