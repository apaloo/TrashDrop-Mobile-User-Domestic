import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './UberStyleTrackingMap.css';

// Fix default Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/assets/marker-icon-2x.png',
  iconUrl: '/assets/marker-icon.png',
  shadowUrl: '/assets/marker-shadow.png',
});

// Enhanced collector icon with navigation/vehicle style
const collectorIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" width="50" height="50">
      <!-- Outer pulsing ring (will be animated via CSS) -->
      <circle cx="25" cy="25" r="22" fill="none" stroke="#3B82F6" stroke-width="2" opacity="0.3"/>
      <!-- Main vehicle icon background -->
      <circle cx="25" cy="25" r="18" fill="#3B82F6" stroke="white" stroke-width="3"/>
      <!-- Vehicle/truck icon -->
      <path d="M15 20 L15 28 L18 28 L18 30 L20 30 L20 28 L30 28 L30 30 L32 30 L32 28 L35 28 L35 23 L32 20 Z" fill="white"/>
      <circle cx="19" cy="30" r="2" fill="white"/>
      <circle cx="31" cy="30" r="2" fill="white"/>
      <!-- Direction arrow -->
      <path d="M25 15 L28 20 L22 20 Z" fill="white"/>
    </svg>
  `),
  iconSize: [50, 50],
  iconAnchor: [25, 25],
  popupAnchor: [0, -25],
  className: 'collector-marker-animated'
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
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Guard: ensure map is ready and has valid container
    if (!map || !map.getContainer()) {
      console.warn('[AutoFitBounds] Map not ready');
      return;
    }

    try {
      // Only update map if we have valid locations
      if (isValidLocation(collectorLocation) && isValidLocation(pickupLocation)) {
        const bounds = L.latLngBounds(
          [collectorLocation.lat, collectorLocation.lng],
          [pickupLocation.lat, pickupLocation.lng]
        );
        
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
          try {
            const container = map.getContainer();
            const panes = map.getPanes();
            
            // Comprehensive check: container exists, has leaflet ID, and panes are ready
            if (container && container._leaflet_id && panes && panes.mapPane) {
              // Force map invalidation before bounds adjustment
              map.invalidateSize();
              map.fitBounds(bounds, { 
                padding: [50, 50], 
                maxZoom: 15,
                animate: hasInitialized.current, // Only animate after first load
                duration: 0.5
              });
              hasInitialized.current = true;
            }
          } catch (err) {
            console.warn('[UberStyleTrackingMap] Error fitting bounds:', err);
          }
        }, 150);
      } else if (isValidLocation(pickupLocation) && !hasInitialized.current) {
        setTimeout(() => {
          try {
            const container = map.getContainer();
            const panes = map.getPanes();
            
            // Comprehensive check: container exists, has leaflet ID, and panes are ready
            if (container && container._leaflet_id && panes && panes.mapPane) {
              map.invalidateSize();
              map.setView([pickupLocation.lat, pickupLocation.lng], 15, {
                animate: false
              });
              hasInitialized.current = true;
            }
          } catch (err) {
            console.warn('[UberStyleTrackingMap] Error setting view:', err);
          }
        }, 150);
      }
    } catch (error) {
      console.error('[AutoFitBounds] Error updating map bounds:', error);
    }
  }, [collectorLocation, pickupLocation, map, isValidLocation]);

  return null;
};

// Animated marker component with pulsing ring effect
const AnimatedCollectorMarker = ({ position, prevPosition }) => {
  const markerRef = useRef();
  const animationRef = useRef();
  
  useEffect(() => {
    if (markerRef.current && prevPosition) {
      const marker = markerRef.current;
      
      // Calculate distance moved (in degrees, rough approximation)
      const deltaLat = Math.abs(position.lat - prevPosition.lat);
      const deltaLng = Math.abs(position.lng - prevPosition.lng);
      const distanceMoved = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng);
      
      // Only animate if movement is significant (> 0.0005 degrees ≈ 55 meters)
      // This prevents bouncing from GPS drift or minor location updates
      if (distanceMoved < 0.0005) {
        // Don't update position at all if movement is negligible
        return;
      }
      
      // Cancel any ongoing animation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      
      const duration = 1500; // 1.5 seconds for smooth animation
      const start = Date.now();
      
      const animate = () => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        
        // Smooth interpolation with easing
        const easeProgress = progress < 0.5 
          ? 2 * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        const lat = prevPosition.lat + (position.lat - prevPosition.lat) * easeProgress;
        const lng = prevPosition.lng + (position.lng - prevPosition.lng) * easeProgress;
        
        marker.setLatLng([lat, lng]);
        
        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          animationRef.current = null;
        }
      };
      
      animate();
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [position, prevPosition]);

  return (
    <Marker 
      ref={markerRef}
      position={[position.lat, position.lng]} 
      icon={collectorIcon}
    >
      <Popup>
        <div className="text-center">
          <strong className="text-blue-600">Collector En Route</strong>
          <p className="text-xs text-gray-600 mt-1">Moving to your location</p>
          <div className="mt-2 px-2 py-1 bg-blue-50 rounded text-xs text-blue-700 font-medium">
            🚚 Live tracking active
          </div>
        </div>
      </Popup>
    </Marker>
  );
};

const UberStyleTrackingMap = ({ 
  collectorLocation,
  collectorData, // Collector profile with is_online, status, location_updated_at
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
  const [isCardExpanded, setIsCardExpanded] = useState(true);

  // Debug logging for incoming props
  useEffect(() => {
    console.log('[UberStyleTrackingMap] Props received:', {
      collectorLocation,
      collectorData,
      pickupLocation,
      distance,
      eta,
      activePickup: activePickup ? {
        id: activePickup.id,
        status: activePickup.status,
        location: activePickup.location,
        coordinates: activePickup.coordinates
      } : null
    });
  }, [collectorLocation, collectorData, pickupLocation, distance, eta, activePickup]);

  // Validate location has valid coordinates
  const isValidLocation = (loc) => {
    return loc && 
           typeof loc.lat === 'number' && 
           typeof loc.lng === 'number' &&
           !isNaN(loc.lat) && 
           !isNaN(loc.lng) &&
           isFinite(loc.lat) &&
           isFinite(loc.lng);
  };

  // Update route line when collector or pickup location changes
  useEffect(() => {
    if (isValidLocation(collectorLocation) && isValidLocation(pickupLocation)) {
      setRouteLine([
        [collectorLocation.lat, collectorLocation.lng],
        [pickupLocation.lat, pickupLocation.lng]
      ]);
      
      // Only store previous location if movement is significant (same threshold as animation)
      if (prevCollectorLocation) {
        const deltaLat = Math.abs(collectorLocation.lat - prevCollectorLocation.lat);
        const deltaLng = Math.abs(collectorLocation.lng - prevCollectorLocation.lng);
        const distanceMoved = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng);
        
        // Only update previous location if movement > 0.0005 degrees (≈ 55 meters)
        if (distanceMoved >= 0.0005) {
          console.log('[UberStyleTrackingMap] Significant movement detected:', {
            distanceMoved: (distanceMoved * 111000).toFixed(0) + 'm',
            from: prevCollectorLocation,
            to: collectorLocation
          });
          setPrevCollectorLocation(collectorLocation);
        } else {
          console.log('[UberStyleTrackingMap] Ignoring minor GPS drift:', (distanceMoved * 111000).toFixed(0) + 'm');
        }
        // Otherwise, keep the old prevCollectorLocation - don't update it
      } else {
        // First time - set it
        console.log('[UberStyleTrackingMap] Setting initial collector location');
        setPrevCollectorLocation(collectorLocation);
      }
    }
  }, [collectorLocation, pickupLocation, prevCollectorLocation]);

  // Use pickup location as center - no fallback
  // Map should only render when we have valid pickup location
  const defaultCenter = isValidLocation(pickupLocation)
    ? [pickupLocation.lat, pickupLocation.lng]
    : null;

  // Create a stable key for MapContainer based on pickup location
  // This ensures map re-initializes cleanly when location changes significantly
  const mapKey = React.useMemo(() => {
    if (isValidLocation(pickupLocation)) {
      return `map-${pickupLocation.lat.toFixed(4)}-${pickupLocation.lng.toFixed(4)}`;
    }
    return null;
  }, [pickupLocation, isValidLocation]);

  // Don't render map if we don't have valid pickup location
  if (!defaultCenter || !mapKey) {
    return (
      <div className="relative w-full h-full bg-gray-100 flex items-center justify-center">
        <div className="text-center p-8">
          <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Location Required</h3>
          <p className="text-sm text-gray-500">Waiting for pickup location data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Map Container - Full Screen */}
      <div className="w-full h-full">
        <MapContainer
          key={mapKey}
          center={defaultCenter}
          zoom={13}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          whenCreated={(mapInstance) => {
            // Ensure map container is properly initialized
            setTimeout(() => {
              if (mapInstance && mapInstance.getContainer()) {
                mapInstance.invalidateSize();
              }
            }, 200);
          }}
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

          {/* Enhanced route line from collector to pickup with gradient effect */}
          {routeLine.length === 2 && (
            <>
              {/* Main route line with blue color */}
              <Polyline 
                positions={routeLine} 
                color="#3B82F6"
                weight={5}
                opacity={0.8}
                dashArray="15, 10"
                dashOffset="0"
                className="route-line-animated"
              />
              {/* Shadow/glow effect for depth */}
              <Polyline 
                positions={routeLine} 
                color="#60A5FA"
                weight={8}
                opacity={0.3}
                dashArray="15, 10"
                dashOffset="0"
              />
            </>
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

      {/* Top-Center ETA Badge - Prominent Display */}
      {isValidLocation(collectorLocation) && typeof eta === 'number' && !isNaN(eta) && isFinite(eta) && eta > 0 && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-[1001]">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full shadow-2xl px-5 py-2.5 flex items-center space-x-2.5 animate-pulse">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <div className="text-xs font-medium opacity-90">Arrives in</div>
              <div className="text-xl font-bold">{eta} min</div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Floating info card - Uber style */}
      {isValidLocation(collectorLocation) && (() => {
        // Check if collector is actually online and moving (same logic as progress bar)
        const isCollectorOnline = collectorData?.is_online === true || collectorData?.status === 'online';
        const hasRecentLocation = collectorData?.location_updated_at ? 
          (new Date() - new Date(collectorData.location_updated_at)) < 300000 : false; // 5 minutes
        
        // For digital bins, use distance-based visual status ONLY for initial tracking
        // Once collector takes action (picked_up, collected, etc.), use real status
        // For pickup requests, always use actual database status
        let displayStatus = activePickup?.status;
        if (activePickup?.is_digital_bin && typeof distance === 'number') {
          // Only override status if it's still in initial "accepted" state
          // Once collector updates to picked_up, collected, etc., show real status
          const isInitialTrackingPhase = displayStatus === 'accepted' || displayStatus === 'active';
          if (isInitialTrackingPhase) {
            // Visual status based on proximity for digital bins
            if (distance <= 50) {
              displayStatus = 'arrived';
            } else if (distance <= 500) {
              displayStatus = 'en_route';
            }
          }
          // else: use real database status (picked_up, collected, etc.)
        }
        
        // Determine display text based on status
        const isActuallyArrived = displayStatus === 'arrived' || displayStatus === 'collecting';
        const isEnRoute = displayStatus === 'en_route' || displayStatus === 'in_transit';
        const isPickingUp = displayStatus === 'picked_up';
        const isCollected = displayStatus === 'collected' || displayStatus === 'completed';
        
        let statusText = 'Collector accepted';
        if (isCollected) {
          statusText = 'Waste collected';
        } else if (isPickingUp) {
          statusText = 'Collector picking up waste';
        } else if (isActuallyArrived) {
          statusText = 'Collector at pickup location';
        } else if (isEnRoute) {
          statusText = 'Collector en route';
        }
        
        return (
          <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-white rounded-2xl shadow-2xl p-3 z-[1000] min-w-[260px] max-w-[90vw]">
            <div className="flex items-center space-x-3">
              {/* Collector Avatar */}
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {statusText}
                </p>
                <div className="flex items-center space-x-3 mt-1">
                  {typeof eta === 'number' && !isNaN(eta) && isFinite(eta) ? (
                    isActuallyArrived ? (
                      <div className="flex items-center">
                        <svg className="w-4 h-4 text-green-500 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-bold text-green-600">Arrived</span>
                      </div>
                    ) : (
                    <div className="flex items-center">
                      <svg className="w-4 h-4 text-gray-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-bold text-green-600">{eta} min</span>
                    </div>
                  )
                ) : (
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-gray-400 mr-1 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="text-xs text-gray-400">Calculating...</span>
                  </div>
                )}
                {typeof distance === 'number' && !isNaN(distance) && isFinite(distance) && distance > 0 && (
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-gray-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                    <span className="text-sm text-gray-600">{distance < 1000 ? `${distance}m` : `${distance}km`}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Pulse indicator */}
            <div className="flex-shrink-0">
              <div className="relative">
                <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
                <div className="absolute inset-0 w-2.5 h-2.5 bg-green-500 rounded-full animate-ping opacity-75"></div>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Enhanced Active Pickup Card with Collector Profile */}
      {activePickup && (
        <div className="absolute top-20 left-4 right-4 md:left-4 md:right-auto md:max-w-sm bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden z-[1000] transition-all duration-300">
          {/* Drag Handle */}
          <div 
            className="flex items-center justify-center py-2 bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors"
            onClick={() => setIsCardExpanded(!isCardExpanded)}
          >
            <div className="w-10 h-1 bg-gray-400 rounded-full"></div>
          </div>

          {/* Card Header - Always Visible */}
          <div 
            className="p-4 cursor-pointer"
            onClick={() => setIsCardExpanded(!isCardExpanded)}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-gray-900">Active Pickup</h3>
              <svg 
                className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${isCardExpanded ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Collector Mini Profile - Only Visible When Collapsed */}
            {!isCardExpanded && activePickup.collector && (
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                  {activePickup.collector.first_name?.[0]}{activePickup.collector.last_name?.[0]}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 text-sm">
                    {activePickup.collector.first_name} {activePickup.collector.last_name}
                  </p>
                  <div className="flex items-center space-x-1">
                    <span className="text-yellow-500 text-xs">⭐</span>
                    <span className="text-sm text-gray-600">{activePickup.collector.rating || '5.0'}</span>
                  </div>
                </div>
                {distance !== null && (
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Distance</p>
                    <p className="text-sm font-bold text-blue-600">{distance < 1000 ? `${distance}m` : `${distance}km`}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Expandable Content */}
          <div className={`transition-all duration-300 overflow-hidden ${isCardExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="px-4 pb-4 space-y-4">
              {/* Collector Full Profile */}
              {activePickup.collector && (
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      {activePickup.collector.profile_image_url ? (
                        <img 
                          src={activePickup.collector.profile_image_url} 
                          alt="Collector" 
                          className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-md">
                          {activePickup.collector.first_name?.[0]}{activePickup.collector.last_name?.[0]}
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-gray-900">
                          {activePickup.collector.first_name} {activePickup.collector.last_name}
                        </p>
                        <div className="flex items-center space-x-1 mt-1">
                          <span className="text-yellow-500">⭐</span>
                          <span className="font-semibold text-gray-700">{activePickup.collector.rating || '5.0'}</span>
                        </div>
                        {activePickup.collector.vehicle_plate && (
                          <p className="text-xs text-gray-600 mt-1">
                            Vehicle: <span className="font-medium">{activePickup.collector.vehicle_plate}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${(() => {
                      // For digital bins, use distance-based visual status ONLY for initial tracking
                      let displayStatus = activePickup.status;
                      if (activePickup.is_digital_bin && typeof distance === 'number') {
                        const isInitialTrackingPhase = displayStatus === 'accepted' || displayStatus === 'active';
                        if (isInitialTrackingPhase) {
                          if (distance <= 50) {
                            displayStatus = 'arrived';
                          } else if (distance <= 500) {
                            displayStatus = 'en_route';
                          }
                        }
                      }
                      
                      if (displayStatus === 'accepted' || displayStatus === 'active') return 'bg-blue-100 text-blue-700';
                      if (displayStatus === 'in_transit' || displayStatus === 'en_route') return 'bg-purple-100 text-purple-700';
                      if (displayStatus === 'arrived') return 'bg-green-100 text-green-700';
                      if (displayStatus === 'picked_up' || displayStatus === 'collecting') return 'bg-orange-100 text-orange-700';
                      if (displayStatus === 'collected' || displayStatus === 'completed') return 'bg-emerald-100 text-emerald-700';
                      return 'bg-yellow-100 text-yellow-700';
                    })()}`}>
                      {(() => {
                        // For digital bins, use distance-based visual status ONLY for initial tracking
                        let displayStatus = activePickup.status;
                        if (activePickup.is_digital_bin && typeof distance === 'number') {
                          const isInitialTrackingPhase = displayStatus === 'accepted' || displayStatus === 'active';
                          if (isInitialTrackingPhase) {
                            if (distance <= 50) {
                              return 'ARRIVED';
                            } else if (distance <= 500) {
                              return 'EN ROUTE';
                            }
                          }
                        }
                        return activePickup.status?.replace('_', ' ').toUpperCase();
                      })()}
                    </span>
                  </div>
                </div>
              )}

              {/* Distance & ETA Info Box */}
              {((typeof distance === 'number' && !isNaN(distance) && isFinite(distance) && distance > 0) || 
                (typeof eta === 'number' && !isNaN(eta) && isFinite(eta) && eta > 0)) && (
                <div className="bg-blue-600 text-white rounded-lg p-2.5">
                  <div className="grid grid-cols-2 gap-3">
                    {typeof distance === 'number' && !isNaN(distance) && isFinite(distance) && distance > 0 && (
                      <div>
                        <p className="text-[10px] text-blue-200 mb-0.5">Distance</p>
                        <p className="text-lg font-bold">{distance < 1000 ? `${distance}m` : `${distance}km`}</p>
                      </div>
                    )}
                    {typeof eta === 'number' && !isNaN(eta) && isFinite(eta) && eta > 0 && (
                      <div>
                        <p className="text-[10px] text-blue-200 mb-0.5">ETA</p>
                        <p className="text-lg font-bold">{eta} min</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Progress Tracker */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 mb-3">PROGRESS</p>
                <div className="relative">
                  {/* Progress Line */}
                  <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-300"></div>
                  <div 
                    className="absolute top-4 left-4 h-0.5 bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-500"
                    style={{ 
                      width: `${(() => {
                        // For digital bins, use distance-based visual status ONLY for initial tracking
                        // For pickup requests, use actual database status
                        let status = activePickup.status;
                        if (activePickup.is_digital_bin && typeof distance === 'number') {
                          const isInitialTrackingPhase = status === 'accepted' || status === 'active';
                          if (isInitialTrackingPhase) {
                            if (distance <= 50) {
                              status = 'arrived';
                            } else if (distance <= 500) {
                              status = 'en_route';
                            }
                          }
                        }
                        
                        if (status === 'available') return '0%';
                        if (status === 'accepted' || status === 'active') return '25%';
                        if (status === 'en_route' || status === 'in_transit') return '50%';
                        if (status === 'arrived') return '75%';
                        if (status === 'collecting' || status === 'picked_up') return '90%';
                        return '100%';
                      })()}` 
                    }}
                  ></div>
                  
                  {/* Progress Stages */}
                  <div className="relative flex justify-between">
                    {['accepted', 'en_route', 'arrived', 'collecting', 'complete'].map((stage, index) => {
                      // For digital bins, use distance-based visual status ONLY for initial tracking
                      // For pickup requests, use actual database status
                      let currentStatus = activePickup.status;
                      if (activePickup.is_digital_bin && typeof distance === 'number') {
                        const isInitialTrackingPhase = currentStatus === 'accepted' || currentStatus === 'active';
                        if (isInitialTrackingPhase) {
                          if (distance <= 50) {
                            currentStatus = 'arrived';
                          } else if (distance <= 500) {
                            currentStatus = 'en_route';
                          }
                        }
                      }
                      
                      const stageStatuses = {
                        accepted: ['accepted', 'active', 'en_route', 'in_transit', 'arrived', 'collecting', 'picked_up', 'collected', 'completed'],
                        en_route: ['en_route', 'in_transit', 'arrived', 'collecting', 'picked_up', 'collected', 'completed'],
                        arrived: ['arrived', 'collecting', 'picked_up', 'collected', 'completed'],
                        collecting: ['collecting', 'picked_up', 'collected', 'completed'],
                        complete: ['collected', 'completed']
                      };
                      const isCompleted = stageStatuses[stage]?.includes(currentStatus);
                      const isCurrent = currentStatus === stage || 
                        (stage === 'accepted' && currentStatus === 'active') ||
                        (stage === 'en_route' && currentStatus === 'in_transit') ||
                        (stage === 'collecting' && currentStatus === 'picked_up') ||
                        (stage === 'complete' && (currentStatus === 'completed' || currentStatus === 'collected'));
                      
                      return (
                        <div key={stage} className="flex flex-col items-center space-y-2 z-10">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                            isCompleted ? 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg' :
                            isCurrent ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg animate-pulse' :
                            'bg-gray-300 text-gray-500'
                          }`}>
                            {isCompleted ? (
                              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <span className="text-xs font-bold">{index + 1}</span>
                            )}
                          </div>
                          <p className={`text-[10px] font-medium text-center max-w-[60px] ${
                            isCurrent ? 'text-blue-600' : 'text-gray-500'
                          }`}>
                            {(() => {
                              // Custom label mapping
                              const labels = {
                                'accepted': 'Accepted',
                                'en_route': 'En Route',
                                'arrived': 'Arrived',
                                'collecting': 'Picked Up',
                                'complete': 'Disposed'
                              };
                              return labels[stage] || stage.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
                            })()}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Pickup Details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Waste Type</p>
                  <p className="text-sm font-semibold text-gray-900 capitalize">{activePickup.waste_type || 'General'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Bags</p>
                  <p className="text-sm font-semibold text-gray-900">{activePickup.bag_count || 0}</p>
                </div>
              </div>

              {activePickup.special_instructions && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-blue-600 font-medium mb-1">Special Instructions</p>
                  <p className="text-sm text-gray-700">{activePickup.special_instructions}</p>
                </div>
              )}

              {/* Action Buttons */}
              {activePickup.collector && (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activePickup.collector.phone) {
                        window.location.href = `tel:${activePickup.collector.phone}`;
                      }
                    }}
                    className="flex flex-col items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-xl p-3 transition-colors shadow-md"
                  >
                    <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span className="text-xs font-semibold">Call</span>
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Chat feature coming soon
                      alert('Chat feature coming soon! For now, please use the Call button to contact the collector.');
                    }}
                    className="flex flex-col items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-xl p-3 transition-colors shadow-md"
                  >
                    <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="text-xs font-semibold">Chat</span>
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Expand/collapse card to show full details
                      setIsCardExpanded(!isCardExpanded);
                    }}
                    className="flex flex-col items-center justify-center bg-gray-600 hover:bg-gray-700 text-white rounded-xl p-3 transition-colors shadow-md"
                  >
                    <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs font-semibold">Details</span>
                  </button>
                </div>
              )}
            </div>
          </div>
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
