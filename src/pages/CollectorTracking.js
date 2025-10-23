import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import UberStyleTrackingMap from '../components/UberStyleTrackingMap.js';
import { pickupService } from '../services/pickupService.js';
import { subscribeToCollectorLocation, calculateETA } from '../utils/realtime.js';
import GeolocationService from '../utils/geolocationService.js';

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
  const [userLocation, setUserLocation] = useState(null);
  const [eta, setEta] = useState(null);
  const [distance, setDistance] = useState(null);
  
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

  // Get user's current location
  useEffect(() => {
    const getUserLocation = async () => {
      try {
        const locationResult = await GeolocationService.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000
        });
        
        if (locationResult.success) {
          setUserLocation({
            latitude: locationResult.coords.latitude,
            longitude: locationResult.coords.longitude
          });
        }
      } catch (err) {
        console.warn('Could not get user location:', err);
      }
    };

    getUserLocation();
  }, []);

  // Subscribe to real-time collector location updates
  useEffect(() => {
    if (!activePickup?.collector_id) return;

    console.log('[CollectorTracking] Setting up real-time location tracking for collector:', activePickup.collector_id);

    const locationSubscription = subscribeToCollectorLocation(
      activePickup.collector_id,
      activePickup.id,
      (locationUpdate) => {
        console.log('[CollectorTracking] Collector location updated:', locationUpdate);
        setCollectorLocation(locationUpdate.location);

        // Calculate ETA if we have user location
        if (userLocation && locationUpdate.location) {
          const etaData = calculateETA(userLocation, locationUpdate.location);
          if (etaData) {
            setEta(etaData.eta);
            setDistance(etaData.distance);
          }
        }
      }
    );

    return () => {
      console.log('[CollectorTracking] Cleaning up location subscription');
      locationSubscription.unsubscribe();
    };
  }, [activePickup?.collector_id, activePickup?.id, userLocation]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="fixed top-20 left-4 z-[1001] p-3 bg-white/95 backdrop-blur-sm rounded-full shadow-lg hover:bg-white transition-colors"
      >
        <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Full-Screen Uber-Style Tracking Map */}
      <div className="fixed inset-0 top-16 z-0">
        <UberStyleTrackingMap 
          collectorLocation={collectorLocation}
          pickupLocation={userLocation || {
            lat: -1.286389,
            lng: 36.817223
          }}
          distance={distance}
          eta={eta}
          activePickup={activePickup}
          error={error}
          isCollector={user?.is_collector}
          onSchedulePickup={() => navigate('/digital-bin')}
          loading={loading}
        />
      </div>
    </div>
  );
};

export default CollectorTracking;
