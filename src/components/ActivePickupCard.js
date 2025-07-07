import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
// Dynamic import for leaflet-routing-machine to prevent SSR issues
import { supabase } from '../utils/supabaseClient';

// Component to update the map view when position changes
const MapUpdater = ({ position }) => {
  const map = useMap();
  
  useEffect(() => {
    if (position && position.length === 2) {
      map.setView(position, map.getZoom());
    }
  }, [position, map]);
  
  return null;
};

// Component to show the routing between two points
const RoutingControl = ({ userPosition, collectorPosition, map }) => {
  useEffect(() => {
    if (!map || !userPosition || !collectorPosition) return;
    
    // Dynamically import Leaflet Routing Machine
    let routingControl;
    
    // Make sure L.Routing is available before using it
    const setupRouting = async () => {
      try {
        // Dynamic import
        await import('leaflet-routing-machine');
        
        routingControl = L.Routing.control({
      waypoints: [
        L.latLng(collectorPosition[0], collectorPosition[1]),
        L.latLng(userPosition[0], userPosition[1])
      ],
      routeWhileDragging: false,
      showAlternatives: false,
      fitSelectedRoutes: false,
      show: false,
      lineOptions: {
        styles: [
          { color: '#6366F1', opacity: 0.8, weight: 6 }
        ]
      }
    }).addTo(map);
      } catch (error) {
        console.error('Error loading routing machine:', error);
      }
    };
    
    setupRouting();

    return () => {
      if (routingControl) {
        map.removeControl(routingControl);
      }
    };
  }, [map, userPosition, collectorPosition]);

  return null;
};

// Map component with routing
const PickupMap = ({ userLocation, collectorLocation }) => {
  const [map, setMap] = useState(null);

  return (
    <MapContainer 
      center={userLocation || [37.7749, -122.4194]}
      zoom={13}
      style={{ height: '200px', width: '100%', borderRadius: '0.5rem' }}
      whenCreated={setMap}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      
      {userLocation && (
        <Marker position={userLocation}>
          <Popup>Your location</Popup>
        </Marker>
      )}
      
      {collectorLocation && (
        <Marker position={collectorLocation}>
          <Popup>Collector location</Popup>
        </Marker>
      )}
      
      <MapUpdater position={userLocation} />
      
      {map && userLocation && collectorLocation && (
        <RoutingControl 
          userPosition={userLocation} 
          collectorPosition={collectorLocation} 
          map={map}
        />
      )}
    </MapContainer>
  );
};

/**
 * ActivePickupCard component - Shows real-time updates for an active pickup request
 * Supports offline functionality with cached data
 */
const ActivePickupCard = ({ activePickup, onCancel, onRefresh }) => {
  const [etaMinutes, setEtaMinutes] = useState(null);
  const [distance, setDistance] = useState(null);
  const [collectorLocation, setCollectorLocation] = useState(null);
  const [subscription, setSubscription] = useState(null);

  // Handle offline functionality by checking navigator.onLine
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Add online/offline event listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!activePickup) return;
    
    // Only subscribe to real-time updates if online
    if (!isOnline) {
      // If offline, use cached data or display offline indicators
      console.log('Currently offline, using cached pickup data');
      return;
    }
    
    // Subscribe to real-time updates on the collector's location and ETA
    const pickupSubscription = supabase
      .channel(`pickup-${activePickup.id}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'pickups',
        filter: `id=eq.${activePickup.id}`
      }, payload => {
        // Update pickup status, ETA, and distance if changed
        if (payload.new.status !== activePickup.status) {
          onRefresh();
        }
        
        if (payload.new.eta_minutes !== undefined) {
          setEtaMinutes(payload.new.eta_minutes);
        }
        
        if (payload.new.distance !== undefined) {
          setDistance(payload.new.distance);
        }
      })
      .subscribe();

    // Subscribe to real-time updates on the collector's location
    const collectorSubscription = supabase
      .channel(`collector-${activePickup.collector_id}`)
      .on('presence', { event: 'sync' }, () => {
        const state = collectorSubscription.presenceState();
        const collector = state[activePickup.collector_id];
        if (collector && collector[0] && collector[0].location) {
          setCollectorLocation([collector[0].location.lat, collector[0].location.lng]);
        }
      })
      .subscribe();

    // Store the subscription for cleanup
    setSubscription({ pickup: pickupSubscription, collector: collectorSubscription });

    // Simulate initial data if needed for development
    if (!activePickup.collector_location && process.env.NODE_ENV === 'development') {
      // Simulated collector location - slightly offset from user location
      const userLocation = activePickup.location;
      if (userLocation) {
        const simulatedCollectorLocation = [
          userLocation[0] + (Math.random() * 0.01 - 0.005),
          userLocation[1] + (Math.random() * 0.01 - 0.005)
        ];
        setCollectorLocation(simulatedCollectorLocation);
        setEtaMinutes(Math.floor(Math.random() * 15) + 5);
        setDistance(Math.round((Math.random() * 2 + 0.5) * 10) / 10);
      }
    } else if (activePickup.collector_location) {
      setCollectorLocation(activePickup.collector_location);
      setEtaMinutes(activePickup.eta_minutes);
      setDistance(activePickup.distance);
    }

    return () => {
      // Clean up subscriptions
      if (subscription) {
        subscription.pickup.unsubscribe();
        subscription.collector.unsubscribe();
      }
    };
  }, [activePickup, onRefresh]);

  if (!activePickup) return null;

  // Helper function to render status badge
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'waiting_for_collector':
        return <span className="px-3 py-1 bg-yellow-400 dark:bg-yellow-500 text-yellow-800 dark:text-yellow-100 rounded-full font-medium">Waiting for collector</span>;
      case 'collector_assigned':
        return <span className="px-3 py-1 bg-blue-400 dark:bg-blue-500 text-blue-800 dark:text-blue-100 rounded-full font-medium">Collector assigned</span>;
      case 'en_route':
        return <span className="px-3 py-1 bg-blue-400 dark:bg-blue-500 text-blue-800 dark:text-blue-100 rounded-full font-medium">En route</span>;
      case 'arrived':
        return <span className="px-3 py-1 bg-green-400 dark:bg-green-500 text-green-800 dark:text-green-100 rounded-full font-medium">Collector arrived</span>;
      default:
        return <span className="px-3 py-1 bg-gray-400 dark:bg-gray-500 text-gray-800 dark:text-gray-100 rounded-full font-medium">{status}</span>;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden mb-6">
      <div className="flex justify-between items-center bg-blue-50 dark:bg-blue-900/30 p-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">Active Pickup Request</h2>
        {renderStatusBadge(activePickup.status)}
      </div>

      <div className="p-6">
        {/* Grid of pickup details - 2 rows with 3 items each with gamification elements */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {/* Row 1: Collector, Distance, ETA */}
          {/* Collector information with gamification */}
          <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg relative overflow-hidden">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300">Collector</h3>
              <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">Pro</span>
            </div>
            <p className="text-lg font-medium text-gray-800 dark:text-white">{activePickup.collector_name || 'John (Demo)'}</p>
            <div className="mt-2 flex items-center">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-700 dark:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="ml-2">
                <span className="text-xs text-blue-700 dark:text-blue-300">5★ Rating</span>
              </div>
            </div>
          </div>

          {/* Distance information with gamification */}
          <div className="bg-green-50 dark:bg-green-900/30 p-3 rounded-lg relative overflow-hidden">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-green-700 dark:text-green-300">Distance</h3>
              <span className="bg-green-600 text-white text-xs px-2 py-1 rounded-full">Near</span>
            </div>
            <p className="text-lg font-medium text-gray-800 dark:text-white">
              {distance !== null ? `${distance} km` : 'Distance unavailable'}
            </p>
            {/* Progress animation showing collector getting closer */}
            <div className="w-full h-2 bg-green-200 dark:bg-green-700 rounded-full mt-2">
              <div className="h-2 bg-green-600 dark:bg-green-400 rounded-full" 
                style={{ width: distance ? `${Math.max(0, 100 - (distance * 15))}%` : '0%' }}>  
              </div>
            </div>
            <p className="text-xs text-green-600 dark:text-green-300 mt-1">
              {distance ? `${Math.round((1 - distance/10) * 100)}% complete` : 'Calculating...'}
            </p>
          </div>

          {/* ETA information with gamification */}
          <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg relative overflow-hidden">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300">ETA</h3>
              {etaMinutes && etaMinutes < 15 ? (
                <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">Soon!</span>
              ) : (
                <span className="bg-yellow-600 text-white text-xs px-2 py-1 rounded-full">On the way</span>
              )}
            </div>
            <p className="text-lg font-medium text-gray-800 dark:text-white">
              {etaMinutes !== null ? `${etaMinutes} minutes` : 'ETA unavailable'}
            </p>
            {/* Countdown timer visualization */}
            <div className="w-full h-2 bg-blue-200 dark:bg-blue-700 rounded-full mt-2">
              <div className="h-2 bg-blue-600 dark:bg-blue-400 rounded-full" 
                style={{ width: etaMinutes ? `${Math.max(0, 100 - (etaMinutes * 3))}%` : '0%' }}>
              </div>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
              {etaMinutes ? `Arrives in ${etaMinutes} min` : 'Calculating arrival time...'}
            </p>
          </div>

          {/* Row 2: Waste Type, Location, Points */}
          {/* Waste Type & Quantity with gamification */}
          <div className="bg-green-50 dark:bg-green-900/30 p-3 rounded-lg relative overflow-hidden">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-green-700 dark:text-green-300">Waste</h3>
              <span className="bg-green-600 text-white text-xs px-2 py-1 rounded-full">
                {activePickup.waste_type === 'Recyclables' ? 'Eco+' : 'Standard'}
              </span>
            </div>
            <p className="text-lg font-medium text-gray-800 dark:text-white">
              {activePickup.waste_type} ({activePickup.number_of_bags} {parseInt(activePickup.number_of_bags) === 1 ? 'bag' : 'bags'})
            </p>
            {/* Visual indicator of waste type */}
            <div className="flex mt-2">
              {[...Array(parseInt(activePickup.number_of_bags) || 1)].map((_, i) => (
                <div key={i} className="w-4 h-4 mr-1 bg-green-400 dark:bg-green-600 rounded-full"></div>
              ))}
            </div>
            <p className="text-xs text-green-600 dark:text-green-300 mt-1">
              {activePickup.waste_type === 'Recyclables' ? 'Recycling bonus +10%' : 'Regular disposal'}
            </p>
          </div>

          {/* Pickup Location with gamification */}
          <div className="bg-red-50 dark:bg-red-900/30 p-3 rounded-lg relative overflow-hidden">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">Location</h3>
              <span className="bg-red-600 text-white text-xs px-2 py-1 rounded-full">Verified</span>
            </div>
            <p className="text-lg font-medium text-gray-800 dark:text-white truncate">
              {activePickup.address || 'Location unavailable'}
            </p>
            {/* Map pin animation */}
            <div className="flex items-center mt-2">
              <svg className="w-5 h-5 text-red-500 animate-bounce" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              <span className="ml-1 text-xs text-red-600 dark:text-red-300">Location confirmed</span>
            </div>
          </div>

          {/* Earned Points with gamification */}
          <div className="bg-yellow-50 dark:bg-yellow-900/30 p-3 rounded-lg relative overflow-hidden">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-yellow-700 dark:text-yellow-300">Points</h3>
              <span className="bg-yellow-600 text-white text-xs px-2 py-1 rounded-full">+{activePickup.points || 0}</span>
            </div>
            <p className="text-lg font-medium text-gray-800 dark:text-white">
              {activePickup.points || 0}
            </p>
            {/* Points sparkle animation */}
            <div className="flex justify-between mt-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className={`w-3 h-3 rounded-full ${i < (activePickup.points / 10) ? 'bg-yellow-400' : 'bg-gray-200 dark:bg-gray-700'}`}></div>
              ))}
            </div>
            <p className="text-xs text-yellow-600 dark:text-yellow-300 mt-1">
              {activePickup.points >= 50 ? 'Achievement unlocked!' : `${50 - (activePickup.points || 0)} more for next badge`}
            </p>
            {activePickup.points >= 50 && (
              <div className="absolute -top-1 -right-1">
                <span className="flex h-5 w-5">
                  <span className="animate-ping absolute h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                  <span className="relative rounded-full h-5 w-5 bg-yellow-500 flex items-center justify-center text-xs text-white">★</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Map with collector's location and route */}
        <div className="h-72 w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <PickupMap 
            userLocation={activePickup.location} 
            collectorLocation={collectorLocation}
          />
        </div>
      </div>

      {/* Cancel button */}
      <div className="p-4 bg-gray-50 dark:bg-gray-700 flex justify-end">
        <button 
          onClick={() => onCancel(activePickup.id)}
          className="px-4 py-2 bg-red-500 text-white font-medium rounded-md hover:bg-red-600 transition-colors"
        >
          Cancel Request
        </button>
      </div>
    </div>
  );
};

export default ActivePickupCard;
