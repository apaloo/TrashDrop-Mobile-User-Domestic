import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './UberStyleTrackingMap.css';
import { formatDistance } from '../utils/geoUtils.js';
import { useArrivalQR } from '../context/useArrivalQR.js';

// Fix default Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/assets/marker-icon-2x.png',
  iconUrl: '/assets/marker-icon.png',
  shadowUrl: '/assets/marker-shadow.png',
});

// Collector: the brand green disc with a lime ring and a truck, so it reads as "your collector"
const collectorIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
      <circle cx="24" cy="24" r="21" fill="#b6ee69" opacity="0.45"/>
      <circle cx="24" cy="24" r="16" fill="#1b6e35" stroke="#ffffff" stroke-width="3"/>
      <path d="M15 19h11v9H15z M26 22h4l3 3v3h-7z" fill="#ffffff"/>
      <circle cx="19" cy="29.5" r="2" fill="#ffffff" stroke="#1b6e35" stroke-width="1"/>
      <circle cx="29" cy="29.5" r="2" fill="#ffffff" stroke="#1b6e35" stroke-width="1"/>
    </svg>
  `),
  iconSize: [48, 48],
  iconAnchor: [24, 24],
  popupAnchor: [0, -24],
  className: 'collector-marker-animated'
});

// Pickup point: a dark pin with a lime centre, distinct from the green collector
const pickupIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32" width="30" height="40">
      <path d="M12 1C6 1 1.5 5.5 1.5 11.5 1.5 19 12 31 12 31s10.5-12 10.5-19.5C22.5 5.5 18 1 12 1z" fill="#0a0f0a" stroke="#ffffff" stroke-width="1.5"/>
      <circle cx="12" cy="11.5" r="4.5" fill="#b6ee69"/>
    </svg>
  `),
  iconSize: [30, 40],
  iconAnchor: [15, 40],
  popupAnchor: [0, -40]
});

// Room to leave around the two pins: the sheet covers the bottom on phones
// and the left side on wider screens; the back button sits top left
const fitPadding = () => (
  window.matchMedia && window.matchMedia('(min-width: 768px)').matches
    ? { paddingTopLeft: [420, 40], paddingBottomRight: [60, 40] }
    : { paddingTopLeft: [40, 90], paddingBottomRight: [40, 280] }
);

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
                ...fitPadding(),
                maxZoom: 16,
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
          <strong className="text-td-ink">Your collector</strong>
          <p className="text-xs text-td-sage mt-1">Live location</p>
        </div>
      </Popup>
    </Marker>
  );
};

// The steps on the Active Pickup panel, and the statuses that mean each is done.
// 'disposed' is the last step: the collector has dropped the waste at a disposal site.
const PROGRESS_STEPS = [
  { key: 'accepted', label: 'Accepted', reachedBy: ['accepted', 'active', 'en_route', 'in_transit', 'arrived', 'collecting', 'picked_up', 'collected', 'completed', 'disposed'] },
  { key: 'en_route', label: 'En route', reachedBy: ['en_route', 'in_transit', 'arrived', 'collecting', 'picked_up', 'collected', 'completed', 'disposed'] },
  { key: 'arrived', label: 'Arrived', reachedBy: ['arrived', 'collecting', 'picked_up', 'collected', 'completed', 'disposed'] },
  { key: 'collecting', label: 'Picked up', reachedBy: ['collecting', 'picked_up', 'collected', 'completed', 'disposed'] },
  { key: 'complete', label: 'Disposed', reachedBy: ['collected', 'completed', 'disposed'] },
];

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
  // Collapsed at first, so the map stays in view
  const [isCardExpanded, setIsCardExpanded] = useState(false);

  // How old the collector's last location is, re-checked every 30s so the
  // note appears even when no new location arrives
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const locationUpdatedAt = collectorData?.location_updated_at
    ? new Date(collectorData.location_updated_at).getTime()
    : null;
  const locationAgeMinutes = locationUpdatedAt ? Math.floor((now - locationUpdatedAt) / 60000) : null;
  const isLocationStale = locationAgeMinutes !== null && locationAgeMinutes >= 2;

  // Compute display status once — for digital bins in initial tracking phase,
  // override with distance-based visual status; otherwise use actual DB status.
  const displayStatus = useMemo(() => {
    let status = activePickup?.status;
    if (activePickup?.is_digital_bin && typeof distance === 'number') {
      const isInitialTrackingPhase = status === 'accepted' || status === 'active';
      if (isInitialTrackingPhase) {
        if (distance <= 50) status = 'arrived';
        else if (distance <= 500) status = 'en_route';
      }
    }
    return status;
  }, [activePickup?.status, activePickup?.is_digital_bin, distance]);

  // Digital bins: the collector scans the bin's QR code on arrival. Have it
  // ready on the phone, and open it by itself when the collector gets here.
  const { showBinQR, autoShowBinQR, prepareBinQR } = useArrivalQR();
  const qrBin = activePickup?.is_digital_bin ? {
    id: activePickup.id,
    location_id: activePickup.location_id || null,
    location_name: activePickup.location?.location_name || '',
  } : null;
  const qrBinId = qrBin?.id;
  useEffect(() => {
    if (qrBin) prepareBinQR(qrBin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrBinId, prepareBinQR]);
  useEffect(() => {
    if (qrBin && displayStatus === 'arrived') autoShowBinQR(qrBin);
    // qrBin is rebuilt each render; its id is what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrBinId, displayStatus, autoShowBinQR]);
  // Until the scan moves the bin on
  const canShowQR = Boolean(qrBin) &&
    ['accepted', 'active', 'en_route', 'in_transit', 'arrived'].includes(displayStatus);

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
          <svg className="mx-auto h-16 w-16 text-td-sage mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-td-ink mb-2">Location Required</h3>
          <p className="text-sm text-td-sage">Waiting for pickup location data...</p>
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
          attributionControl={false}
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
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {/* Zoom buttons top right; hidden on phones, which pinch (see the CSS) */}
          <ZoomControl position="topright" />

          {/* Auto-fit bounds */}
          <AutoFitBounds 
            collectorLocation={collectorLocation} 
            pickupLocation={pickupLocation}
            isValidLocation={isValidLocation}
          />

          {/* Route: a white casing under the brand green line, readable on any street */}
          {routeLine.length === 2 && (
            <>
              <Polyline positions={routeLine} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9, lineCap: 'round' }} />
              <Polyline positions={routeLine} pathOptions={{ color: '#1b6e35', weight: 5, opacity: 1, lineCap: 'round', dashArray: '1 10' }} className="route-line-animated" />
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
                  <strong className="text-td-ink">Your location</strong>
                  <p className="text-xs text-td-sage mt-1">Pickup point</p>
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

      {/* Active pickup: a bottom sheet on phones (a side card on wider screens),
          collapsed to the essentials so the map and the alerts above it stay in view */}
      {activePickup && (() => {
        const collector = activePickup.collector;
        const hasEta = typeof eta === 'number' && !isNaN(eta) && isFinite(eta) && eta > 0;
        const hasDistance = typeof distance === 'number' && !isNaN(distance) && isFinite(distance) && distance > 0;
        const isActuallyArrived = displayStatus === 'arrived' || displayStatus === 'collecting';
        const isEnRoute = displayStatus === 'en_route' || displayStatus === 'in_transit';
        const isPickingUp = displayStatus === 'picked_up';
        const isDisposed = displayStatus === 'disposed';
        const isCollected = displayStatus === 'collected' || displayStatus === 'completed' || isDisposed;

        let statusText = collector ? 'Collector accepted' : 'Waiting for a collector';
        if (isDisposed) statusText = 'Waste disposed';
        else if (isCollected) statusText = 'Waste collected';
        else if (isPickingUp) statusText = 'Collector picking up waste';
        else if (isActuallyArrived) statusText = 'Collector is here';
        else if (isEnRoute) statusText = 'Collector en route';

        // Steps reached, and the next one (none once all five are done)
        const nextIndex = PROGRESS_STEPS.findIndex((step) => !step.reachedBy.includes(displayStatus));
        const doneCount = nextIndex === -1 ? PROGRESS_STEPS.length : nextIndex;
        const progressText = nextIndex === -1
          ? 'All steps done'
          : `${doneCount} of ${PROGRESS_STEPS.length} done · Next: ${PROGRESS_STEPS[nextIndex].label}`;

        const toggle = () => setIsCardExpanded(!isCardExpanded);

        return (
          <section
            aria-label="Active pickup"
            className="absolute inset-x-0 bottom-0 md:inset-x-auto md:left-4 md:top-4 md:bottom-auto md:w-96 z-[1000] flex flex-col max-h-[75%] md:max-h-[calc(100%-2rem)] bg-white dark:bg-gray-800 border border-td-border dark:border-gray-700 rounded-t-3xl md:rounded-3xl shadow-[0_-8px_24px_rgba(10,15,10,0.12)]"
          >
            <button
              type="button"
              onClick={toggle}
              aria-expanded={isCardExpanded}
              className="flex-shrink-0 flex justify-center pt-2.5 pb-1.5"
            >
              <span aria-hidden="true" className="w-10 h-1 rounded-full bg-td-border dark:bg-gray-600" />
              <span className="sr-only">{isCardExpanded ? 'Show less' : 'Show pickup details'}</span>
            </button>

            <div className="overflow-y-auto overscroll-contain px-5 pb-4">
              {/* Who, what's happening, how long */}
              <div className="flex items-center gap-3">
                {collector?.profile_image_url ? (
                  <img src={collector.profile_image_url} alt="" className="w-12 h-12 flex-shrink-0 rounded-full object-cover" />
                ) : (
                  <div aria-hidden="true" className="w-12 h-12 flex-shrink-0 rounded-full bg-td-forest text-white font-bold flex items-center justify-center">
                    {collector ? `${collector.first_name?.[0] || ''}${collector.last_name?.[0] || ''}` : '…'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-td-ink dark:text-gray-100 truncate">{statusText}</p>
                  {collector && (
                    <p className="text-sm text-td-sage dark:text-gray-300 truncate">
                      {collector.first_name} {collector.last_name}
                      <span aria-hidden="true"> · </span>
                      <span aria-label={`rated ${collector.rating || '5.0'}`}>★ {collector.rating || '5.0'}</span>
                    </p>
                  )}
                  {isLocationStale && !isCollected && (
                    <p className="text-[13px] text-td-orange-text">
                      Location last updated {locationAgeMinutes < 60 ? `${locationAgeMinutes} min` : `${Math.floor(locationAgeMinutes / 60)} h`} ago
                    </p>
                  )}
                </div>
                {(hasEta || isActuallyArrived) && !isCollected && (
                  <div className="flex-shrink-0 text-right" role="status">
                    <p className="text-xl font-bold text-td-forest dark:text-green-300 leading-tight">
                      {isActuallyArrived ? 'Here' : `${eta} min`}
                    </p>
                    {hasDistance && !isActuallyArrived && (
                      <p className="text-[13px] text-td-sage dark:text-gray-300">{formatDistance(distance)} away</p>
                    )}
                  </div>
                )}
              </div>

              {/* Progress: one bar, one line, fits any phone */}
              <div className="mt-4">
                <div
                  role="progressbar"
                  aria-label="Pickup progress"
                  aria-valuemin={0}
                  aria-valuemax={PROGRESS_STEPS.length}
                  aria-valuenow={doneCount}
                  aria-valuetext={progressText}
                  className="flex gap-1"
                >
                  {PROGRESS_STEPS.map((step, index) => (
                    <span
                      key={step.key}
                      className={`h-1.5 flex-1 rounded-full ${
                        index < doneCount ? 'bg-td-forest dark:bg-green-400' :
                        index === doneCount ? 'bg-td-lime' :
                        'bg-td-border dark:bg-gray-600'
                      }`}
                    />
                  ))}
                </div>
                <p className="mt-2 text-[13px] text-td-sage dark:text-gray-300">{progressText}</p>
              </div>

              {/* More, on request */}
              {isCardExpanded && (
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <div className="bg-td-cream dark:bg-gray-900/40 rounded-2xl p-3">
                    <p className="text-[13px] text-td-sage dark:text-gray-300">Waste type</p>
                    <p className="font-semibold text-td-ink dark:text-gray-100 capitalize">{activePickup.waste_type || 'General'}</p>
                  </div>
                  <div className="bg-td-cream dark:bg-gray-900/40 rounded-2xl p-3">
                    <p className="text-[13px] text-td-sage dark:text-gray-300">Bags</p>
                    <p className="font-semibold text-td-ink dark:text-gray-100">{Math.round(Number(activePickup.estimated_volume)) || activePickup.bag_count || 0}</p>
                  </div>
                  {collector?.vehicle_plate && (
                    <div className="col-span-2 bg-td-cream dark:bg-gray-900/40 rounded-2xl p-3">
                      <p className="text-[13px] text-td-sage dark:text-gray-300">Vehicle</p>
                      <p className="font-semibold text-td-ink dark:text-gray-100">{collector.vehicle_plate}</p>
                    </div>
                  )}
                  {activePickup.special_instructions && (
                    <div className="col-span-2 bg-td-tonal dark:bg-green-900/30 rounded-2xl p-3">
                      <p className="text-[13px] font-medium text-td-forest-dk dark:text-green-300">Special instructions</p>
                      <p className="text-sm text-td-ink dark:text-gray-100">{activePickup.special_instructions}</p>
                    </div>
                  )}
                </div>
              )}

              {/* The bin's QR code: the main action once the collector is here */}
              {canShowQR && (
                <button
                  type="button"
                  onClick={() => showBinQR(qrBin, { arrived: displayStatus === 'arrived' })}
                  className={`mt-4 w-full rounded-full flex items-center justify-center gap-2 font-bold ${
                    displayStatus === 'arrived'
                      ? 'h-12 bg-td-lime text-td-ink text-base hover:brightness-95'
                      : 'h-11 border-[1.5px] border-td-forest text-td-forest-dk dark:text-green-300 dark:border-green-400 text-[15px] hover:bg-td-tonal dark:hover:bg-green-900/30'
                  }`}
                >
                  <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />
                  </svg>
                  {displayStatus === 'arrived' ? 'Show QR code to collector' : 'Show QR code'}
                </button>
              )}

              {/* Actions */}
              <div className={`${canShowQR ? 'mt-2.5' : 'mt-4'} grid grid-cols-3 gap-2`}>
                {collector?.phone ? (
                  <a
                    href={`tel:${collector.phone}`}
                    className="h-11 rounded-full bg-td-forest hover:bg-td-forest-dk text-white text-[15px] font-semibold flex items-center justify-center gap-1.5"
                  >
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    Call
                  </a>
                ) : (
                  <span className="h-11 rounded-full bg-td-disabled-bg text-td-disabled-text text-[15px] font-semibold flex items-center justify-center" title="No phone number yet">
                    Call
                  </span>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    if (window.confirm('Are you sure you want to cancel this pickup?')) {
                      try {
                        const { pickupService } = await import('../services/pickupService.js');
                        const { error: cancelError } = await pickupService.cancelPickupRequest(activePickup.id, 'Cancelled by user');
                        if (cancelError) {
                          alert(`Failed to cancel: ${cancelError.message}`);
                        } else {
                          alert('Pickup cancelled successfully.');
                          window.location.href = '/dashboard';
                        }
                      } catch (err) {
                        alert(`Error: ${err.message}`);
                      }
                    }
                  }}
                  className="h-11 rounded-full border-[1.5px] border-red-200 dark:border-red-800 text-td-error dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 text-[15px] font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={isCardExpanded}
                  className="h-11 rounded-full border-[1.5px] border-td-border-strong dark:border-gray-500 text-td-ink dark:text-gray-100 hover:bg-td-cream dark:hover:bg-gray-700 text-[15px] font-semibold"
                >
                  {isCardExpanded ? 'Less' : 'Details'}
                </button>
              </div>

              {/* The map's credit, here because the sheet covers the map's corner */}
              <p className="mt-3 text-[13px] text-td-sage dark:text-gray-400">
                Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap</a> contributors
              </p>
            </div>
          </section>
        );
      })()}

      {/* Error Message: top centre, clear of the back button and the sheet */}
      {error && (
        <div role="alert" className="absolute top-4 left-1/2 -translate-x-1/2 w-[calc(100%-9rem)] max-w-md z-[1001] rounded-2xl border border-red-200 bg-red-50 px-4 py-2 shadow-lg">
          <p className="text-sm text-td-error">{error}</p>
        </div>
      )}

      {/* No collector tracking message */}
      {!isValidLocation(collectorLocation) && !activePickup && isValidLocation(pickupLocation) && (
        <div role="status" className="absolute top-4 left-1/2 -translate-x-1/2 w-[calc(100%-9rem)] max-w-md z-[1001] rounded-2xl border border-td-border bg-white px-4 py-2 shadow-lg">
          <p className="text-sm text-td-ink">Waiting for a collector to accept…</p>
        </div>
      )}

      {/* No Active Pickup Message */}
      {!activePickup && !loading && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 z-[1000] max-w-md">
          <svg className="mx-auto h-16 w-16 text-td-sage mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="text-xl font-bold text-td-ink mb-2">
            {isCollector ? 'No Assigned Pickups' : 'No Active Pickup'}
          </h3>
          <p className="text-td-sage mb-6">
            {isCollector 
              ? 'You currently have no pickup requests assigned to you.'
              : 'You don\'t have any active pickup requests. Schedule one to track collectors in your area.'
            }
          </p>
          {!isCollector && onSchedulePickup && (
            <button
              onClick={onSchedulePickup}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold shadow-lg"
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
