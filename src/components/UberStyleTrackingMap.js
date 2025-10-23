import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/assets/marker-icon-2x.png',
  iconUrl: '/assets/marker-icon.png',
  shadowUrl: '/assets/marker-shadow.png',
});

// Custom icons for collector and pickup
const collectorIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40">
      <circle cx="12" cy="12" r="10" fill="#10B981" stroke="white" stroke-width="2"/>
      <path d="M12 2L12 22M2 12L22 12" stroke="white" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `),
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20]
});

const pickupIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#3B82F6" stroke="white" stroke-width="1.5"/>
      <circle cx="12" cy="9" r="2.5" fill="white"/>
    </svg>
  `),
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40]
});

// Component to auto-fit map bounds
const AutoFitBounds = ({ collectorLocation, pickupLocation, isValidLocation }) => {
  const map = useMap();

  useEffect(() => {
    // Only update map if we have valid locations
    if (isValidLocation(collectorLocation) && isValidLocation(pickupLocation)) {
      const bounds = L.latLngBounds(
        [collectorLocation.lat, collectorLocation.lng],
        [pickupLocation.lat, pickupLocation.lng]
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else if (isValidLocation(pickupLocation)) {
      map.setView([pickupLocation.lat, pickupLocation.lng], 15);
    }
  }, [collectorLocation, pickupLocation, map, isValidLocation]);

  return null;
};

// Animated marker component
const AnimatedCollectorMarker = ({ position, prevPosition }) => {
  const markerRef = useRef();
  
  useEffect(() => {
    if (markerRef.current && prevPosition) {
      const marker = markerRef.current;
      const duration = 1000; // 1 second animation
      const start = Date.now();
      
      const animate = () => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        
        // Interpolate between prev and current position
        const lat = prevPosition.lat + (position.lat - prevPosition.lat) * progress;
        const lng = prevPosition.lng + (position.lng - prevPosition.lng) * progress;
        
        marker.setLatLng([lat, lng]);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      
      animate();
    }
  }, [position, prevPosition]);

  return (
    <Marker 
      ref={markerRef}
      position={[position.lat, position.lng]} 
      icon={collectorIcon}
    >
      <Popup>
        <div className="text-center">
          <strong className="text-green-600">Collector</strong>
          <p className="text-xs text-gray-600 mt-1">On the way to you</p>
        </div>
      </Popup>
    </Marker>
  );
};

const UberStyleTrackingMap = ({ 
  collectorLocation, 
  pickupLocation, 
  distance, 
  eta,
  activePickup,
  error,
  isCollector,
  onSchedulePickup,
  loading
}) => {
  const [prevCollectorLocation, setPrevCollectorLocation] = useState(null);
  const [routeLine, setRouteLine] = useState([]);

  // Validate location has valid coordinates
  const isValidLocation = (loc) => {
    return loc && 
           typeof loc.lat === 'number' && 
           typeof loc.lng === 'number' &&
           !isNaN(loc.lat) && 
           !isNaN(loc.lng);
  };

  // Update route line when collector or pickup location changes
  useEffect(() => {
    if (isValidLocation(collectorLocation) && isValidLocation(pickupLocation)) {
      setRouteLine([
        [collectorLocation.lat, collectorLocation.lng],
        [pickupLocation.lat, pickupLocation.lng]
      ]);
      
      // Store previous location for animation
      setPrevCollectorLocation(collectorLocation);
    }
  }, [collectorLocation, pickupLocation]);

  // Default center with proper validation
  const defaultCenter = isValidLocation(pickupLocation)
    ? [pickupLocation.lat, pickupLocation.lng]
    : [-1.286389, 36.817223]; // Nairobi

  return (
    <div className="relative w-full h-full">
      {/* Map Container - Full Screen */}
      <div className="w-full h-full">
        <MapContainer
          center={defaultCenter}
          zoom={13}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {/* Zoom controls positioned at top right */}
          <ZoomControl position="topright" />

          {/* Auto-fit bounds */}
          <AutoFitBounds 
            collectorLocation={collectorLocation} 
            pickupLocation={pickupLocation}
            isValidLocation={isValidLocation}
          />

          {/* Route line from collector to pickup */}
          {routeLine.length === 2 && (
            <Polyline 
              positions={routeLine} 
              color="#3B82F6"
              weight={4}
              opacity={0.7}
              dashArray="10, 10"
              dashOffset="0"
            />
          )}

          {/* Pickup Location Marker */}
          {isValidLocation(pickupLocation) && (
            <Marker 
              position={[pickupLocation.lat, pickupLocation.lng]} 
              icon={pickupIcon}
            >
              <Popup>
                <div className="text-center">
                  <strong className="text-blue-600">Your Location</strong>
                  <p className="text-xs text-gray-600 mt-1">Pickup point</p>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Animated Collector Marker */}
          {isValidLocation(collectorLocation) && (
            <AnimatedCollectorMarker 
              position={collectorLocation}
              prevPosition={prevCollectorLocation}
            />
          )}
        </MapContainer>
      </div>

      {/* Floating info card - Uber style */}
      {isValidLocation(collectorLocation) && (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-white rounded-2xl shadow-2xl p-4 z-[1000] min-w-[280px]">
          <div className="flex items-center space-x-4">
            {/* Collector Avatar */}
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Collector en route</p>
              <div className="flex items-center space-x-3 mt-1">
                {eta !== null && (
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-gray-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-bold text-green-600">{eta} min</span>
                  </div>
                )}
                {distance !== null && (
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-gray-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                    <span className="text-sm text-gray-600">{distance} km</span>
                  </div>
                )}
              </div>
            </div>

            {/* Pulse indicator */}
            <div className="flex-shrink-0">
              <div className="relative">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <div className="absolute inset-0 w-3 h-3 bg-green-500 rounded-full animate-ping opacity-75"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compact Floating Pickup Details Card - Below Back Button */}
      {activePickup && (
        <div className="absolute top-20 left-4 right-4 md:left-4 md:right-auto md:max-w-sm bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-4 z-[1000]">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900">Active Pickup</h3>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              activePickup.status === 'accepted' ? 'bg-blue-100 text-blue-700' :
              activePickup.status === 'in_transit' ? 'bg-purple-100 text-purple-700' :
              activePickup.status === 'completed' ? 'bg-green-100 text-green-700' :
              'bg-yellow-100 text-yellow-700'
            }`}>
              {activePickup.status?.replace('_', ' ').toUpperCase()}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-2">
              <p className="text-xs text-gray-500">Waste Type</p>
              <p className="text-sm font-semibold text-gray-900 capitalize">{activePickup.waste_type || 'General'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <p className="text-xs text-gray-500">Bags</p>
              <p className="text-sm font-semibold text-gray-900">{activePickup.bag_count || 0}</p>
            </div>
          </div>

          {activePickup.special_instructions && (
            <div className="mt-3 p-2 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-600 font-medium">Instructions</p>
              <p className="text-xs text-gray-700 mt-1">{activePickup.special_instructions}</p>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 z-[1000] max-w-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* No collector tracking message */}
      {!isValidLocation(collectorLocation) && !activePickup && isValidLocation(pickupLocation) && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 z-[1000]">
          <p className="text-sm text-yellow-800">
            <svg className="inline w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            Waiting for collector to accept...
          </p>
        </div>
      )}

      {/* No Active Pickup Message */}
      {!activePickup && !loading && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 z-[1000] max-w-md">
          <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            {isCollector ? 'No Assigned Pickups' : 'No Active Pickup'}
          </h3>
          <p className="text-gray-600 mb-6">
            {isCollector 
              ? 'You currently have no pickup requests assigned to you.'
              : 'You don\'t have any active pickup requests. Schedule one to track collectors in your area.'
            }
          </p>
          {!isCollector && onSchedulePickup && (
            <button
              onClick={onSchedulePickup}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold shadow-lg"
            >
              Schedule a Pickup
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default UberStyleTrackingMap;
