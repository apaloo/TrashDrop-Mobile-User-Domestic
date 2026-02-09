import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import UberStyleTrackingMap from '../components/UberStyleTrackingMap.js';
import { pickupService } from '../services/pickupService.js';
import { subscribeToCollectorLocation, calculateETA } from '../utils/realtime.js';
import GeolocationService from '../utils/geolocationService.js';
import { showDistanceAlert, showStatusNotification } from '../utils/toastNotifications.js';
import supabase from '../utils/supabaseClient.js';

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
  const [collectorProfile, setCollectorProfile] = useState(null); // Store full collector profile data
  const [userLocation, setUserLocation] = useState(null);
  const [eta, setEta] = useState(null);
  const [distance, setDistance] = useState(null);
  
  // Refs for smart update logic
  const lastUpdateTime = useRef(Date.now());
  const lastNotificationDistance = useRef(null);
  const lastStatus = useRef(null);
  const statusTransitions = useRef(new Set()); // Track which status transitions have occurred
  const updateThrottleMs = 15000; // Throttle updates to every 15 seconds to prevent bouncing

  // Shared function to update status based on proximity
  const updateStatusBasedOnProximity = useCallback(async (distanceMeters, currentStatus) => {
    // IMPORTANT: Digital bins use different status values than pickup_requests
    // Skip status updates for digital bins to avoid constraint violations
    if (activePickup.is_digital_bin) {
      console.log('[CollectorTracking] ℹ️ Skipping status update for digital bin (uses different status system)');
      return;
    }
    
    let newStatus = null;
    let transitionKey = null;
    
    // Within 50m = Arrived
    if (distanceMeters <= 50 && currentStatus !== 'arrived' && currentStatus !== 'collecting' && currentStatus !== 'completed') {
      newStatus = 'arrived';
      transitionKey = 'arrived';
      console.log('[CollectorTracking] 🎯 Collector within 50m, updating status to ARRIVED');
    }
    // Within 500m = En Route (if still at accepted)
    else if (distanceMeters <= 500 && currentStatus === 'accepted') {
      newStatus = 'en_route';
      transitionKey = 'en_route';
      console.log('[CollectorTracking] 🚗 Collector within 500m, updating status to EN_ROUTE');
    }
    
    // Only update if we haven't already made this transition
    if (newStatus && transitionKey && !statusTransitions.current.has(transitionKey)) {
      statusTransitions.current.add(transitionKey);
      
      // Update database (pickup_requests only)
      if (false) { // Digital bin branch removed
      } else {
        try {
          const { error } = await supabase
            .from('pickup_requests')
            .update({ 
              status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', activePickup.id);
          
          if (error) {
            console.error('[CollectorTracking] Error updating pickup request status:', error);
            statusTransitions.current.delete(transitionKey); // Allow retry
          } else {
            console.log('[CollectorTracking] ✅ Pickup request status updated to:', newStatus);
            // Update local state
            setActivePickup(prev => ({ ...prev, status: newStatus }));
          }
        } catch (err) {
          console.error('[CollectorTracking] Exception updating status:', err);
          statusTransitions.current.delete(transitionKey); // Allow retry
        }
      }
    }
  }, [activePickup]);

  // Helper function to parse PostGIS POINT string: "POINT(lng lat)" or EWKB hex or GeoJSON
  const parsePostGISPoint = (pointData) => {
    if (!pointData) {
      console.warn('[CollectorTracking] parsePostGISPoint: No input provided');
      return null;
    }
    
    // Handle GeoJSON object format
    if (typeof pointData === 'object') {
      console.log('[CollectorTracking] Received object, checking for GeoJSON:', pointData);
      
      // GeoJSON Point format: { type: "Point", coordinates: [lng, lat] }
      if (pointData.type === 'Point' && Array.isArray(pointData.coordinates) && pointData.coordinates.length >= 2) {
        const lng = parseFloat(pointData.coordinates[0]);
        const lat = parseFloat(pointData.coordinates[1]);
        console.log('[CollectorTracking] Parsed GeoJSON:', { lat, lng });
        return { lat, lng };
      }
      
      // Direct coordinates object: { latitude: X, longitude: Y } or { lat: X, lng: Y }
      if (pointData.latitude && pointData.longitude) {
        return { lat: parseFloat(pointData.latitude), lng: parseFloat(pointData.longitude) };
      }
      if (pointData.lat && pointData.lng) {
        return { lat: parseFloat(pointData.lat), lng: parseFloat(pointData.lng) };
      }
      
      console.warn('[CollectorTracking] Object format not recognized:', pointData);
      return null;
    }
    
    if (typeof pointData !== 'string') {
      console.warn('[CollectorTracking] parsePostGISPoint: Invalid type', typeof pointData);
      return null;
    }
    
    const pointString = pointData;
    
    // Check if it's EWKB hex format (starts with 0101000020)
    if (pointString.match(/^0101000020/i)) {
      try {
        console.log('[CollectorTracking] Parsing EWKB hex, length:', pointString.length);
        
        // EWKB format: 01 (little endian) 01000000 (point) 20 (has SRID) E6100000 (SRID 4326) + coordinates
        // Skip to coordinate data (after SRID): 01 01000000 20 E6100000 = 18 chars
        const coordHex = pointString.substring(18);
        
        if (coordHex.length < 32) {
          console.error('[CollectorTracking] EWKB hex too short:', coordHex.length, 'expected at least 32');
          return null;
        }
        
        // Extract longitude (8 bytes = 16 hex chars)
        const lngHex = coordHex.substring(0, 16);
        // Extract latitude (next 8 bytes = 16 hex chars)
        const latHex = coordHex.substring(16, 32);
        
        // Convert hex to double (little endian)
        const lngBuffer = new ArrayBuffer(8);
        const lngView = new DataView(lngBuffer);
        for (let i = 0; i < 8; i++) {
          lngView.setUint8(i, parseInt(lngHex.substring(i * 2, i * 2 + 2), 16));
        }
        const longitude = lngView.getFloat64(0, true); // true = little endian
        
        const latBuffer = new ArrayBuffer(8);
        const latView = new DataView(latBuffer);
        for (let i = 0; i < 8; i++) {
          latView.setUint8(i, parseInt(latHex.substring(i * 2, i * 2 + 2), 16));
        }
        const latitude = latView.getFloat64(0, true);
        
        // Validate coordinates are reasonable
        if (isNaN(latitude) || isNaN(longitude) || !isFinite(latitude) || !isFinite(longitude)) {
          console.error('[CollectorTracking] Invalid coordinates after parsing:', { latitude, longitude });
          return null;
        }
        
        // Validate latitude is between -90 and 90, longitude between -180 and 180
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
          console.error('[CollectorTracking] Coordinates out of range:', { latitude, longitude });
          return null;
        }
        
        console.log('[CollectorTracking] Successfully parsed EWKB:', { latitude, longitude });
        
        return { lat: latitude, lng: longitude };
      } catch (err) {
        console.error('[CollectorTracking] Error parsing EWKB:', err, 'Input:', pointString);
        return null;
      }
    }
    
    // Match WKT POINT(lng lat) format
    const match = pointString.match(/POINT\s*\(\s*([+-]?\d+\.?\d*)\s+([+-]?\d+\.?\d*)\s*\)/i);
    if (match) {
      const lat = parseFloat(match[2]);
      const lng = parseFloat(match[1]);
      console.log('[CollectorTracking] Parsed WKT:', { lat, lng });
      return { lat, lng };
    }
    
    console.warn('[CollectorTracking] Unable to parse location string:', pointString.substring(0, 50) + '...');
    return null;
  };
  
  // Get pickup ID from URL params if provided
  const pickupId = searchParams.get('pickupId');

  // Fetch active pickup details
  useEffect(() => {
    const fetchActivePickup = async () => {
      if (!user?.id) return;

      try {
        setLoading(true);
        setError(null); // Clear previous errors
        let pickup = null;

        if (pickupId) {
          // Fetch specific pickup by ID
          const { data: pickupData, error: pickupError } = await pickupService.getPickupDetails(pickupId);
          if (pickupError) {
            console.error('[CollectorTracking] Error from getPickupDetails:', pickupError);
            throw new Error(`Failed to fetch pickup: ${pickupError.message}`);
          }
          if (!pickupData) {
            throw new Error('Pickup not found. It may have been completed or cancelled.');
          }
          pickup = pickupData;
        } else {
          // Fetch user's active pickup
          const { data: activePickupData, error: activeError } = await pickupService.getActivePickup(user.id);
          if (activeError) {
            console.error('[CollectorTracking] Error from getActivePickup:', activeError);
            throw new Error(`Failed to fetch active pickup: ${activeError.message}`);
          }
          if (!activePickupData) {
            throw new Error('No active pickups found. Schedule a pickup to track a collector.');
          }
          pickup = activePickupData;
        }

        setActivePickup(pickup);
        
        // Debug logging for location data
        if (pickup) {
          console.log('[CollectorTracking] Active pickup loaded:', {
            id: pickup.id,
            location: pickup.location,
            coordinates: pickup.coordinates,
            collector_id: pickup.collector_id,
            is_digital_bin: pickup.is_digital_bin
          });

          // Validate that we have valid location data
          let hasValidLocation = false;
          
          // Check location object
          if (pickup.location?.latitude && pickup.location?.longitude) {
            hasValidLocation = true;
          }
          // Check coordinates field (PostGIS POINT)
          else if (typeof pickup.coordinates === 'string' && pickup.coordinates.includes('POINT')) {
            const parsed = parsePostGISPoint(pickup.coordinates);
            hasValidLocation = !!parsed;
          }
          // Check location as PostGIS POINT
          else if (typeof pickup.location === 'string' && pickup.location.includes('POINT')) {
            const parsed = parsePostGISPoint(pickup.location);
            hasValidLocation = !!parsed;
          }
          
          if (!hasValidLocation) {
            console.error('[CollectorTracking] Pickup has no valid location coordinates');
            setError('Pickup location is missing. Please ensure the request has valid location data.');
            setActivePickup(null);
            return; // Exit early if no valid location
          }
        }
        
        // Set up real-time subscription for status changes
        if (pickup && pickup.id) {
          const tableName = pickup.is_digital_bin ? 'digital_bins' : 'pickup_requests';
          console.log(`[CollectorTracking] Setting up real-time subscription for ${tableName}:`, pickup.id);
          
          const statusSubscription = supabase
            .channel(`pickup-status-${pickup.id}`)
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: tableName,
                filter: `id=eq.${pickup.id}`
              },
              (payload) => {
                console.log('[CollectorTracking] 🔔 Status update received:', payload.new);
                
                // Update the activePickup state with new status
                setActivePickup(prev => ({
                  ...prev,
                  status: payload.new.status,
                  updated_at: payload.new.updated_at,
                  collected_at: payload.new.collected_at,
                  disposed_at: payload.new.disposed_at
                }));
                
                console.log('[CollectorTracking] ✅ Progress bar will auto-update to:', payload.new.status);
              }
            )
            .subscribe();
          
          // Store subscription for cleanup
          return statusSubscription;
        }
      } catch (err) {
        console.error('[CollectorTracking] Error fetching pickup:', err);
        setError(err.message || 'Failed to load pickup details');
        setActivePickup(null); // Ensure activePickup is null on error
      } finally {
        setLoading(false);
      }
    };

    const statusSubscription = fetchActivePickup();
    
    // Cleanup subscription on unmount
    return () => {
      if (statusSubscription && statusSubscription.then) {
        statusSubscription.then(sub => {
          if (sub) {
            console.log('[CollectorTracking] Cleaning up status subscription');
            supabase.removeChannel(sub);
          }
        });
      }
    };
  }, [user, pickupId]);

  const handleCollectorLocationUpdate = (location) => {
    setCollectorLocation(location);
    console.log('Collector location updated:', location);
  };

  // Fetch initial collector location from collector_profiles when collector is assigned
  useEffect(() => {
    const fetchCollectorLocation = async () => {
      if (!activePickup?.collector_id) {
        console.log('[CollectorTracking] No collector assigned yet');
        setCollectorLocation(null);
        return;
      }

      try {
        console.log('[CollectorTracking] Fetching collector location from database for:', activePickup.collector_id);
        
        const { data: profileData, error: profileError } = await supabase
          .from('collector_profiles')
          .select('current_latitude, current_longitude, current_location, location_updated_at, status, is_online')
          .eq('user_id', activePickup.collector_id)
          .maybeSingle();

        if (profileError) {
          console.error('[CollectorTracking] Error fetching collector profile:', profileError);
          return;
        }

        if (profileData) {
          // Store full profile data for progress bar logic
          setCollectorProfile(profileData);
          
          let location = null;
          
          console.log('[CollectorTracking] Collector profile data:', {
            has_current_location: !!profileData.current_location,
            current_location_type: typeof profileData.current_location,
            current_location_value: profileData.current_location,
            current_location_preview: profileData.current_location && typeof profileData.current_location === 'string' ? 
              (profileData.current_location.substring(0, 50) + '...') : 'NOT A STRING',
            has_lat: !!profileData.current_latitude,
            has_lng: !!profileData.current_longitude,
            is_online: profileData.is_online,
            status: profileData.status
          });
          
          // Priority 1: Try RPC function for consistent WKT format
          try {
            const { data: coordResult, error: rpcError } = await supabase
              .rpc('get_collector_coordinates_wkt', { collector_user_id: activePickup.collector_id });
            
            if (!rpcError && coordResult) {
              console.log('[CollectorTracking] 📍 RPC returned WKT:', coordResult);
              const coords = parsePostGISPoint(coordResult);
              if (coords) {
                location = { lat: coords.lat, lng: coords.lng };
                console.log('[CollectorTracking] ✅ Successfully parsed location from RPC WKT:', location);
              }
            }
          } catch (rpcErr) {
            console.warn('[CollectorTracking] RPC not available, falling back to EWKB parsing');
          }
          
          // Priority 2: Try current_location (PostGIS geometry EWKB)
          if (!location && profileData.current_location) {
            const coords = parsePostGISPoint(profileData.current_location);
            if (coords) {
              location = { lat: coords.lat, lng: coords.lng };
              console.log('[CollectorTracking] ✅ Successfully parsed location from EWKB:', location);
            } else {
              console.warn('[CollectorTracking] ❌ Failed to parse current_location EWKB');
            }
          }
          
          // Priority 3: Fallback to current_latitude/current_longitude
          if (!location && profileData.current_latitude && profileData.current_longitude) {
            location = {
              lat: parseFloat(profileData.current_latitude),
              lng: parseFloat(profileData.current_longitude)
            };
            console.log('[CollectorTracking] ✅ Using lat/lng fields:', location);
          }
          
          if (location) {
            // Check if location is stale (> 5 minutes old)
            const locationAge = profileData.location_updated_at 
              ? Date.now() - new Date(profileData.location_updated_at).getTime()
              : Infinity;
            const isLocationStale = locationAge > 5 * 60 * 1000; // 5 minutes
            const locationAgeMinutes = Math.round(locationAge / 60000);
            
            if (isLocationStale) {
              console.warn('[CollectorTracking] ⚠️ STALE LOCATION: Last updated', locationAgeMinutes, 'minutes ago');
              console.warn('[CollectorTracking] ⚠️ Collector may not be actively tracking. Location data is outdated.');
            }
            
            // Validate coordinates are within reasonable Ghana bounds
            // Ghana: lat 4.5-11.5°N, lng -3.5 to 1.5°E
            const isInGhanaBounds = location.lat >= 4.0 && location.lat <= 12.0 && 
                                    location.lng >= -4.0 && location.lng <= 2.0;
            
            if (!isInGhanaBounds) {
              console.warn('[CollectorTracking] ⚠️ Collector location appears to be outside Ghana:', location);
              console.warn('[CollectorTracking] ⚠️ This may indicate stale/incorrect location data in the database');
            }
            
            // Determine actual online status based on recent location updates
            const isActuallyOnline = profileData.is_online && !isLocationStale;
            
            console.log('[CollectorTracking] Collector location fetched:', location, 
              `(${isActuallyOnline ? 'ONLINE - Live tracking' : isLocationStale ? 'STALE - ' + locationAgeMinutes + ' min old' : 'OFFLINE'})`);
            setCollectorLocation(location);
            
            // Calculate initial ETA if we have pickup location
            let pickupLoc = null;
            // Prioritize coordinates field (correct WKT POINT(lng lat)) over location field (non-standard POINT(lat lng))
            if (typeof activePickup?.coordinates === 'string') {
              const parsed = parsePostGISPoint(activePickup.coordinates);
              if (parsed) {
                pickupLoc = { latitude: parsed.lat, longitude: parsed.lng };
              }
            } else if (activePickup?.location?.latitude && activePickup?.location?.longitude) {
              pickupLoc = {
                latitude: activePickup.location.latitude,
                longitude: activePickup.location.longitude
              };
            } else if (typeof activePickup?.location === 'string') {
              const parsed = parsePostGISPoint(activePickup.location);
              if (parsed) {
                pickupLoc = { latitude: parsed.lat, longitude: parsed.lng };
              }
            }

            if (pickupLoc) {
              // Calculate ETA/distance based on last known location
              const collectorLoc = {
                latitude: location.lat,
                longitude: location.lng
              };
              const etaData = calculateETA(pickupLoc, collectorLoc);
              if (etaData) {
                console.log('[CollectorTracking] ETA calculated:', etaData, 
                  profileData.is_online ? '(LIVE)' : '(Based on last known location)');
                
                // Warn if distance is unreasonably large (> 100km indicates stale/wrong data)
                if (etaData.distanceKm > 100) {
                  console.warn('[CollectorTracking] ⚠️ Distance is very large:', etaData.distanceKm.toFixed(1), 'km');
                  console.warn('[CollectorTracking] ⚠️ Collector location may be stale or incorrect');
                  console.warn('[CollectorTracking] ⚠️ Collector coords:', collectorLoc, 'Pickup coords:', pickupLoc);
                }
                
                // Only update if values are valid numbers (cache last good values)
                if (typeof etaData.eta === 'number' && !isNaN(etaData.eta) && isFinite(etaData.eta)) {
                  setEta(etaData.eta);
                }
                if (typeof etaData.distance === 'number' && !isNaN(etaData.distance) && isFinite(etaData.distance)) {
                  setDistance(etaData.distance);
                }
                
                // Update status based on proximity (initial fetch)
                if (etaData.distanceMeters !== undefined) {
                  updateStatusBasedOnProximity(etaData.distanceMeters, activePickup.status).catch(err => {
                    console.error('[CollectorTracking] Error in initial status update:', err);
                  });
                }
              } else {
                console.warn('[CollectorTracking] Failed to calculate ETA - keeping cached values');
                // Don't clear cached values - keep showing last valid distance/ETA
              }
            } else {
              console.warn('[CollectorTracking] No pickup location available for ETA calculation');
              // Don't clear cached values - keep showing last valid distance/ETA
            }
          } else {
            console.warn('[CollectorTracking] No valid location data found for collector');
            setCollectorLocation(null);
          }
        } else {
          console.log('[CollectorTracking] Collector profile not found');
          setCollectorLocation(null);
        }
      } catch (err) {
        console.error('[CollectorTracking] Error fetching collector location:', err);
      }
    };

    fetchCollectorLocation();
  }, [activePickup?.collector_id, activePickup?.location, activePickup?.id]);

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

  // Subscribe to real-time collector location updates with smart throttling and notifications
  useEffect(() => {
    if (!activePickup?.collector_id) return;

    console.log('[CollectorTracking] Setting up real-time location tracking for collector:', activePickup.collector_id);
    
    // Initialize last status
    if (activePickup.status && !lastStatus.current) {
      lastStatus.current = activePickup.status;
    }

    // Get pickup location from activePickup data
    // Prioritize coordinates field (correct WKT POINT(lng lat)) over location field (non-standard POINT(lat lng))
    let pickupLoc = null;
    if (typeof activePickup?.coordinates === 'string') {
      const parsed = parsePostGISPoint(activePickup.coordinates);
      if (parsed) {
        pickupLoc = {
          latitude: parsed.lat,
          longitude: parsed.lng
        };
      }
    } else if (activePickup?.location?.latitude && activePickup?.location?.longitude) {
      pickupLoc = {
        latitude: activePickup.location.latitude,
        longitude: activePickup.location.longitude
      };
    } else if (typeof activePickup?.location === 'string') {
      const parsed = parsePostGISPoint(activePickup.location);
      if (parsed) {
        pickupLoc = {
          latitude: parsed.lat,
          longitude: parsed.lng
        };
      }
    } else if (activePickup?.coordinates && Array.isArray(activePickup.coordinates) && activePickup.coordinates.length === 2) {
      pickupLoc = {
        latitude: activePickup.coordinates[0],
        longitude: activePickup.coordinates[1]
      };
    } else if (activePickup?.location && Array.isArray(activePickup.location) && activePickup.location.length === 2) {
      pickupLoc = {
        latitude: activePickup.location[0],
        longitude: activePickup.location[1]
      };
    }

    const locationSubscription = subscribeToCollectorLocation(
      activePickup.collector_id,
      activePickup.id,
      (locationUpdate) => {
        const now = Date.now();
        
        // Throttle updates to prevent UI thrashing (update every 5 seconds max)
        if (now - lastUpdateTime.current < updateThrottleMs) {
          console.log('[CollectorTracking] Update throttled, skipping...');
          return;
        }
        
        lastUpdateTime.current = now;
        console.log('[CollectorTracking] Collector location updated:', locationUpdate);
        
        // Convert location format from {latitude, longitude} to {lat, lng}
        const formattedLocation = locationUpdate.location ? {
          lat: locationUpdate.location.latitude,
          lng: locationUpdate.location.longitude
        } : null;
        
        if (formattedLocation) {
          setCollectorLocation(formattedLocation);

          // Calculate ETA and distance if we have pickup location
          if (pickupLoc) {
            const etaData = calculateETA(pickupLoc, locationUpdate.location);
            if (etaData) {
              const newEta = etaData.eta;
              const newDistance = etaData.distance;
              const distanceMeters = etaData.distanceMeters;
              
              console.log('[CollectorTracking] Distance calculated:', {
                display: newDistance,
                meters: distanceMeters,
                eta: newEta,
                currentStatus: activePickup.status
              });
              
              // Only update if values are valid numbers (cache last good values)
              if (typeof newEta === 'number' && !isNaN(newEta) && isFinite(newEta)) {
                setEta(newEta);
              }
              if (typeof newDistance === 'number' && !isNaN(newDistance) && isFinite(newDistance)) {
                setDistance(newDistance);
              }
              
              // Always check proximity and update status (real-time callback)
              updateStatusBasedOnProximity(distanceMeters, activePickup.status).catch(err => {
                console.error('[CollectorTracking] Error in status update:', err);
              });
              
              // Distance-based notifications (only notify on significant changes)
              const shouldNotify = 
                !lastNotificationDistance.current ||
                Math.abs(lastNotificationDistance.current - newDistance) > 0.2; // 200m threshold
              
              if (shouldNotify) {
                showDistanceAlert(newDistance, newEta);
                lastNotificationDistance.current = newDistance;
              }
            }
          }
        }
      }
    );

    return () => {
      console.log('[CollectorTracking] Cleaning up location subscription');
      locationSubscription.unsubscribe();
    };
  }, [activePickup?.collector_id, activePickup?.id, activePickup?.location, activePickup?.coordinates]);
  
  // Monitor pickup status changes and show notifications
  useEffect(() => {
    if (!activePickup?.status) return;
    
    if (lastStatus.current && lastStatus.current !== activePickup.status) {
      const collectorName = activePickup.collector 
        ? `${activePickup.collector.first_name} ${activePickup.collector.last_name}`
        : 'Collector';
      
      showStatusNotification(lastStatus.current, activePickup.status, collectorName);
    }
    
    lastStatus.current = activePickup.status;
  }, [activePickup?.status, activePickup?.collector]);
  
  // ETA countdown timer (updates every 30 seconds when collector is moving)
  useEffect(() => {
    if (!eta || !distance || !activePickup || !collectorLocation) return;
    
    // Get pickup location from activePickup data
    // Prioritize coordinates field (correct WKT POINT(lng lat)) over location field (non-standard POINT(lat lng))
    let pickupLoc = null;
    if (typeof activePickup?.coordinates === 'string') {
      const parsed = parsePostGISPoint(activePickup.coordinates);
      if (parsed) {
        pickupLoc = {
          latitude: parsed.lat,
          longitude: parsed.lng
        };
      }
    } else if (activePickup?.location?.latitude && activePickup?.location?.longitude) {
      pickupLoc = {
        latitude: activePickup.location.latitude,
        longitude: activePickup.location.longitude
      };
    } else if (typeof activePickup?.location === 'string') {
      const parsed = parsePostGISPoint(activePickup.location);
      if (parsed) {
        pickupLoc = {
          latitude: parsed.lat,
          longitude: parsed.lng
        };
      }
    } else if (activePickup?.coordinates && Array.isArray(activePickup.coordinates) && activePickup.coordinates.length === 2) {
      pickupLoc = {
        latitude: activePickup.coordinates[0],
        longitude: activePickup.coordinates[1]
      };
    } else if (activePickup?.location && Array.isArray(activePickup.location) && activePickup.location.length === 2) {
      pickupLoc = {
        latitude: activePickup.location[0],
        longitude: activePickup.location[1]
      };
    }

    if (!pickupLoc) return;
    
    const countdownInterval = setInterval(() => {
      // Recalculate ETA every 30 seconds
      // collectorLocation is {lat, lng} format - convert to {latitude, longitude} for calculateETA
      const collectorLoc = {
        latitude: collectorLocation.lat,
        longitude: collectorLocation.lng
      };
      const etaData = calculateETA(pickupLoc, collectorLoc);
      if (etaData) {
        // Only update if values are valid numbers (cache last good values)
        if (typeof etaData.eta === 'number' && !isNaN(etaData.eta) && isFinite(etaData.eta)) {
          setEta(etaData.eta);
        }
        if (typeof etaData.distance === 'number' && !isNaN(etaData.distance) && isFinite(etaData.distance)) {
          setDistance(etaData.distance);
        }
      }
    }, 30000); // Update every 30 seconds
    
    return () => clearInterval(countdownInterval);
  }, [eta, distance, activePickup, collectorLocation]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading pickup details...</p>
        </div>
      </div>
    );
  }

  // Show error state if there's an error or no pickup
  if (error || !activePickup) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <button
          onClick={() => navigate(-1)}
          className="fixed top-20 left-4 z-[1001] p-3 bg-white/95 backdrop-blur-sm rounded-full shadow-lg hover:bg-white transition-colors"
        >
          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Unable to Load Pickup</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {error || 'No active pickup found'}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => navigate('/digital-bin')}
                className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Schedule New Pickup
              </button>
            </div>
          </div>
        </div>
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
          collectorData={collectorProfile}
          pickupLocation={(() => {
            console.log('[CollectorTracking] Extracting pickupLocation from:', {
              location: activePickup?.location,
              coordinates: activePickup?.coordinates
            });
            
            // Priority 1: Parse coordinates field (PostGIS POINT from database)
            if (typeof activePickup?.coordinates === 'string') {
              const parsed = parsePostGISPoint(activePickup.coordinates);
              if (parsed) {
                console.log('[CollectorTracking] Using coordinates PostGIS POINT (database):', parsed);
                return parsed;
              }
            }
            
            // Priority 2: Parse location field as PostGIS POINT
            if (typeof activePickup?.location === 'string') {
              const parsed = parsePostGISPoint(activePickup.location);
              if (parsed) {
                console.log('[CollectorTracking] Using location PostGIS POINT:', parsed);
                return parsed;
              }
            }
            
            // Priority 3: Location object with latitude/longitude fields (digital bins)
            if (activePickup?.location?.latitude && activePickup?.location?.longitude) {
              console.log('[CollectorTracking] Using location object with lat/lng:', activePickup.location);
              return {
                lat: activePickup.location.latitude,
                lng: activePickup.location.longitude
              };
            }
            
            // Priority 4: Coordinates array [lat, lng]
            if (activePickup?.coordinates && Array.isArray(activePickup.coordinates) && activePickup.coordinates.length === 2) {
              console.log('[CollectorTracking] Using coordinates array');
              return {
                lat: activePickup.coordinates[0],
                lng: activePickup.coordinates[1]
              };
            }
            
            // Priority 5: Location array [lat, lng]
            if (activePickup?.location && Array.isArray(activePickup.location) && activePickup.location.length === 2) {
              console.log('[CollectorTracking] Using location array');
              return {
                lat: activePickup.location[0],
                lng: activePickup.location[1]
              };
            }
            
            // No fallback - return null if no valid pickup location from request
            console.error('[CollectorTracking] No valid pickup location found in request data');
            return null;
          })()}
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
