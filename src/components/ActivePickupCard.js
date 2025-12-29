import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
// Dynamic import for leaflet-routing-machine to prevent SSR issues
import supabase from '../utils/supabaseClient.js';
import { FaQrcode, FaTimes } from 'react-icons/fa';
import { QRCodeSVG } from 'qrcode.react';
import { createPortal } from 'react-dom';
import { subscribeToCollectorLocation, calculateETA } from '../utils/realtime.js';

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
      style={{ height: '100%', width: '100%', borderRadius: '0.5rem', zIndex: 1 }}
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
  const [showQRCode, setShowQRCode] = useState(false);

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
    
    console.log('[ActivePickupCard] Setting up real-time subscriptions for pickup:', activePickup.id);

    // Subscribe to real-time updates on the pickup status
    const pickupSubscription = supabase
      .channel(`pickup-${activePickup.id}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'pickup_requests',
        filter: `id=eq.${activePickup.id}`
      }, payload => {
        console.log('[ActivePickupCard] Pickup status update received:', payload.new);
        // Update pickup status if changed
        if (payload.new.status !== activePickup.status) {
          onRefresh();
        }
        
        // Update ETA and distance if provided in pickup_requests table
        if (payload.new.eta_minutes !== undefined) {
          setEtaMinutes(payload.new.eta_minutes);
        }
        
        if (payload.new.distance !== undefined) {
          setDistance(payload.new.distance);
        }
      })
      .subscribe();

    // Subscribe to real-time collector location updates using the new helper
    let locationSubscription = null;
    if (activePickup.collector_id) {
      locationSubscription = subscribeToCollectorLocation(
        activePickup.collector_id,
        activePickup.id,
        (locationUpdate) => {
          console.log('[ActivePickupCard] Collector location update received:', locationUpdate);
          
          // Update collector location for map display
          if (locationUpdate.location) {
            const loc = locationUpdate.location;
            // Handle both formats: {latitude, longitude} and {lat, lng}
            const lat = loc.latitude || loc.lat;
            const lng = loc.longitude || loc.lng;
            if (lat && lng) {
              setCollectorLocation([lat, lng]);
              
              // Calculate ETA if we have user location
              if (activePickup.location && activePickup.location.length === 2) {
                const userLoc = {
                  latitude: activePickup.location[0],
                  longitude: activePickup.location[1]
                };
                const collectorLoc = {
                  latitude: lat,
                  longitude: lng
                };
                const etaData = calculateETA(userLoc, collectorLoc);
                if (etaData) {
                  setEtaMinutes(etaData.eta);
                  setDistance(etaData.distance);
                }
              }
            }
          }
        }
      );
    }

    // Store the subscription for cleanup
    setSubscription({ pickup: pickupSubscription, location: locationSubscription });

    // Load initial collector location if available
    if (activePickup.collector_location) {
      setCollectorLocation(activePickup.collector_location);
      setEtaMinutes(activePickup.eta_minutes);
      setDistance(activePickup.distance);
    }

    return () => {
      // Clean up subscriptions
      console.log('[ActivePickupCard] Cleaning up subscriptions');
      if (subscription) {
        if (subscription.pickup) {
          supabase.removeChannel(subscription.pickup);
        }
        if (subscription.location) {
          subscription.location.unsubscribe();
        }
      }
    };
  }, [activePickup, onRefresh, isOnline]);

  if (!activePickup) return null;

  // Helper function to render status badge
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'waiting_for_collector':
        return <span className="px-3 py-1 bg-yellow-400 dark:bg-yellow-500 text-yellow-800 dark:text-yellow-100 rounded-full font-medium flex items-center justify-center text-center">Waiting for collector</span>;
      case 'collector_assigned':
        return <span className="px-3 py-1 bg-blue-400 dark:bg-blue-500 text-blue-800 dark:text-blue-100 rounded-full font-medium flex items-center justify-center text-center">Collector assigned</span>;
      case 'en_route':
        return <span className="px-3 py-1 bg-blue-400 dark:bg-blue-500 text-blue-800 dark:text-blue-100 rounded-full font-medium flex items-center justify-center text-center">En route</span>;
      case 'arrived':
        return <span className="px-3 py-1 bg-green-400 dark:bg-green-500 text-green-800 dark:text-green-100 rounded-full font-medium flex items-center justify-center text-center">Collector arrived</span>;
      default:
        return <span className="px-3 py-1 bg-gray-400 dark:bg-gray-500 text-gray-800 dark:text-gray-100 rounded-full font-medium flex items-center justify-center text-center">{status}</span>;
    }
  };

  // QR Code Modal Component
  const QRCodeModal = () => {
    if (!showQRCode) return null;
    
    return createPortal(
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
        <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-xl flex flex-col items-center relative">
          <button 
            onClick={() => setShowQRCode(false)}
            className="absolute top-4 right-4 text-gray-600 hover:text-gray-800 transition-colors"
            aria-label="Close QR code view"
          >
            <FaTimes size={24} />
          </button>
          
          <h3 className="text-xl font-bold mb-4 text-center text-gray-800">Scan this QR Code</h3>
          <p className="text-gray-600 mb-6 text-center">Present this QR code to your collector for pickup verification</p>
          
          <div className="bg-white p-4 rounded-lg shadow-inner">
            <QRCodeSVG 
              value={activePickup ? JSON.stringify({
                id: activePickup.id,
                type: 'pickup',
                timestamp: Date.now()
              }) : 'invalid'}
              size={250}
              level="H"
              includeMargin={true}
              className="w-full h-full"
            />
          </div>
          
          <p className="mt-6 text-sm text-gray-500">Pickup ID: {activePickup?.id || 'Unknown'}</p>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden mb-20 md:mb-6">
      <div className="flex justify-between items-center bg-blue-50 dark:bg-blue-900/30 p-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">Active Pickup Request</h2>
        {renderStatusBadge(activePickup.status)}
      </div>

      <div className="p-6">
        {/* Grid of pickup details - 3 rows with 2 items each with gamification elements */}
        <div className="grid grid-cols-2 gap-4 mb-6">
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

          {/* ETA Section */}
          <div className="w-full">
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
      <div className="h-64 w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 mb-0 relative z-0">
        <PickupMap 
          userLocation={activePickup.location} 
          collectorLocation={collectorLocation}
        />
        
        {/* QR Code Floating Action Button */}
        <button
          onClick={() => setShowQRCode(true)}
          className="absolute bottom-4 right-4 h-12 w-12 rounded-full bg-primary text-white flex items-center justify-center shadow-lg z-10 hover:bg-primary-dark transition-colors duration-200"
          aria-label="Show QR Code"
        >
          <FaQrcode size={20} />
        </button>
      </div>
      {/* Cancel button */}
      <div className="p-4 bg-gray-50 dark:bg-gray-700 flex justify-end">
        <button 
          onClick={() => {
            if (window.confirm('Are you sure you want to cancel this pickup request?')) {
              console.log('Cancelling pickup request with ID:', activePickup.id);
              onCancel && onCancel(activePickup.id);
            }
          }}
          className="px-4 py-2 bg-red-500 text-white font-medium rounded-md hover:bg-red-600 transition-colors"
          disabled={!activePickup.id}
        >
          Cancel Request
        </button>
      </div>
    </div>
  );
};

export default ActivePickupCard;
