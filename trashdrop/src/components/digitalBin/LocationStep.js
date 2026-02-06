import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import supabase from '../../utils/supabaseClient.js';
import { useAuth } from '../../context/AuthContext.js';
import toastService from '../../services/toastService.js';
import GeolocationService from '../../utils/geolocationService.js';

// Fix for default marker icon in Leaflet with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Component to update map view when position changes
const MapUpdater = ({ position }) => {
  const map = useMapEvents({});
  
  useEffect(() => {
    // Only update map if we have a valid position with both coordinates
    if (position && Array.isArray(position) && position[0] != null && position[1] != null) {
      map.setView(position, map.getZoom());
    }
  }, [position, map]);
  
  return null;
};

// Draggable marker component
const DraggableMarker = ({ position, setPosition }) => {
  const map = useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });

  // Only render marker if we have a valid position with both coordinates
  const hasValidPosition = position && Array.isArray(position) && position[0] != null && position[1] != null;
  
  return hasValidPosition ? 
    <Marker 
      position={position} 
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const marker = e.target;
          const markerPos = marker.getLatLng();
          setPosition([markerPos.lat, markerPos.lng]);
        },
      }}
    /> : null;
};

const LocationStep = ({ formData, updateFormData, nextStep }) => {
  const { user } = useAuth();
  
  // NO DEFAULT LOCATION - require actual GPS coordinates
  // Start with null position until GPS provides real coordinates
  const [position, setPosition] = useState(
    formData.latitude && formData.longitude 
      ? [formData.latitude, formData.longitude] 
      : null // No fallback - require real GPS
  );
  const [savedLocations, setSavedLocations] = useState([]);
  const [addressInput, setAddressInput] = useState(formData.address || '');
  const [addressError, setAddressError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [gpsHint, setGpsHint] = useState(''); // Help text for poor GPS accuracy

  // Initialize form data with default values if not provided
  useEffect(() => {
    updateFormData({
      ...formData,
      latitude: formData.latitude || (position ? position[0] : null),
      longitude: formData.longitude || (position ? position[1] : null),
      address: formData.address || '',
      useCurrentLocation: formData.useCurrentLocation || false
    });
  }, []);

  // Auto-fetch current location on modal launch to center the map, fill address, and check checkbox
  useEffect(() => {
    const autoFetchLocation = async () => {
      // Skip if we already have a position or if location was already fetched
      if (position || formData.latitude || formData.longitude) return;
      
      setLoadingLocation(true);
      
      try {
        console.log('[LocationStep] Auto-fetching current location on mount...');
        
        if (!navigator.geolocation) {
          console.log('[LocationStep] Geolocation not supported');
          setLoadingLocation(false);
          return;
        }
        
        const locationResult = await GeolocationService.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
          silentFallback: true
        });
        
        if (locationResult.success && locationResult.coords) {
          const { latitude, longitude, accuracy } = locationResult.coords;
          
          console.log(`[LocationStep] Auto-location obtained: ${latitude}, ${longitude} (accuracy: ${accuracy}m)`);
          
          // Update map position to center on user's location
          setPosition([latitude, longitude]);
          
          // Auto-check the checkbox and update form data
          updateFormData({
            latitude,
            longitude,
            gps_accuracy: accuracy,
            useCurrentLocation: true
          });
          
          // Reverse geocode to get address
          await reverseGeocode(latitude, longitude);
          
          // Show accuracy hint if needed
          if (locationResult.accuracyWarning) {
            setGpsHint(`GPS accuracy is ${accuracy?.toFixed(0)}m. For better accuracy, move to an open area away from buildings.`);
          }
        }
      } catch (error) {
        console.warn('[LocationStep] Auto-fetch location failed:', error);
      } finally {
        setLoadingLocation(false);
      }
    };
    
    autoFetchLocation();
  }, []);

  // Load saved locations from localStorage and Supabase
  useEffect(() => {
    const fetchSavedLocations = async () => {
      if (!user) return;
      
      setIsLoading(true);
      
      try {
        // First check localStorage for immediate display (user-specific cache)
        const cacheKey = `trashdrop_locations_${user.id}`;
        const cachedLocations = localStorage.getItem(cacheKey);
        if (cachedLocations) {
          const parsedLocations = JSON.parse(cachedLocations);
          console.log('Loaded locations from local storage in LocationStep:', parsedLocations);
          setSavedLocations(parsedLocations);
        }
        
        // Fetch from bin_locations (primary table for digital bins)
        const { data: binLocations, error: binError } = await supabase
          .from('bin_locations')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        // Also check legacy locations table for backward compatibility
        const { data: legacyLocations, error: legacyError } = await supabase
          .from('locations')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        if (binError && legacyError) throw binError;
        
        // Combine locations from both tables, preferring bin_locations
        const allLocations = [
          ...(binLocations || []),
          ...(legacyLocations || []).filter(legacy => 
            !(binLocations || []).some(bin => 
              bin.address === legacy.address && bin.location_name === legacy.name
            )
          )
        ];
        
        if (allLocations.length > 0) {
          // Format locations to match component's expected structure
          const formattedLocations = allLocations.map(location => ({
            id: location.id,
            name: location.location_name || location.name,
            address: location.address || '',
            city: location.city || '',
            latitude: location.latitude,
            longitude: location.longitude,
            synced: true,
            source: location.location_name ? 'bin_locations' : 'locations'
          }));
          
          console.log('Loaded user locations from Supabase in LocationStep:', formattedLocations);
          
          // Merge with local storage data for any offline-saved locations (reuse cacheKey)
          const cachedLocations = localStorage.getItem(cacheKey);
          const localLocations = cachedLocations ? JSON.parse(cachedLocations) : [];
          
          // Identify any local-only locations (ones not synced to server yet)
          const localOnlyLocations = localLocations.filter(
            local => local.id.toString().startsWith('local_') && 
                     !formattedLocations.some(server => 
                        server.name === local.name && server.address === local.address)
          );
          
          // Combine server locations with any local-only locations
          const mergedLocations = [...formattedLocations, ...localOnlyLocations];
          
          // Update state with all locations
          setSavedLocations(mergedLocations);
          
          // Update localStorage with merged data (reuse cacheKey)
          localStorage.setItem(cacheKey, JSON.stringify(mergedLocations));
        }
      } catch (error) {
        console.error('Error fetching locations:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSavedLocations();
  }, [user]);
  
  // Handler for setting position from map
  const handlePositionChange = (newPosition) => {
    if (!newPosition || !Array.isArray(newPosition) || newPosition.length !== 2) return;
    if (newPosition[0] == null || newPosition[1] == null) return;
    
    const [latitude, longitude] = newPosition;
    setPosition(newPosition);
    updateFormData({
      latitude,
      longitude
    });
  };
  
  // Handler for saved location selection
  const handleLocationSelect = (e) => {
    const locationId = e.target.value;
    if (!locationId) return;

    const selectedLocation = savedLocations.find(loc => loc.id.toString() === locationId.toString());
    if (selectedLocation) {
      const { latitude, longitude, address, id } = selectedLocation;
      setPosition([latitude, longitude]);
      setAddressInput(address || '');
      updateFormData({
        location_id: id,
        address: address || '',
        latitude,
        longitude,
        useCurrentLocation: false
      });
    }
  };
  
  // Helper function to reverse geocode coordinates to address
  const reverseGeocode = async (latitude, longitude) => {
    try {
      console.log('[LocationStep] Reverse geocoding:', latitude, longitude);
      
      // Try multiple geocoding services for reliability
      let addressFound = null;
      
      // Try 1: Nominatim (OpenStreetMap)
      try {
        const nominatimResponse = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&email=support@trashdrop.app`,
          { headers: { 'Accept': 'application/json' } }
        );
        
        if (nominatimResponse.ok) {
          const data = await nominatimResponse.json();
          console.log('[LocationStep] Nominatim result:', data);
          
          if (data.display_name) {
            addressFound = data.display_name;
          } else if (data.address) {
            // Build address from parts
            const parts = [];
            if (data.address.road) parts.push(data.address.road);
            if (data.address.suburb) parts.push(data.address.suburb);
            if (data.address.city || data.address.town || data.address.village) {
              parts.push(data.address.city || data.address.town || data.address.village);
            }
            if (data.address.country) parts.push(data.address.country);
            if (parts.length > 0) {
              addressFound = parts.join(', ');
            }
          }
        }
      } catch (nominatimError) {
        console.warn('[LocationStep] Nominatim failed:', nominatimError.message);
      }
      
      // Try 2: BigDataCloud (free, no API key needed)
      if (!addressFound) {
        try {
          const bigDataResponse = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          
          if (bigDataResponse.ok) {
            const data = await bigDataResponse.json();
            console.log('[LocationStep] BigDataCloud result:', data);
            
            if (data.locality || data.city || data.principalSubdivision) {
              const parts = [];
              if (data.locality) parts.push(data.locality);
              if (data.city && data.city !== data.locality) parts.push(data.city);
              if (data.principalSubdivision) parts.push(data.principalSubdivision);
              if (data.countryName) parts.push(data.countryName);
              addressFound = parts.join(', ');
            }
          }
        } catch (bigDataError) {
          console.warn('[LocationStep] BigDataCloud failed:', bigDataError.message);
        }
      }
      
      if (addressFound) {
        console.log('[LocationStep] Address found:', addressFound);
        setAddressInput(addressFound);
        updateFormData({ address: addressFound });
        return true;
      }
      
    } catch (error) {
      console.warn('[LocationStep] Reverse geocoding error:', error);
    }
    
    // Fallback: Generate a meaningful location description
    const fallbackAddress = `Near ${latitude.toFixed(4)}°N, ${Math.abs(longitude).toFixed(4)}°W`;
    setAddressInput(fallbackAddress);
    updateFormData({ address: fallbackAddress });
    console.log('[LocationStep] Using coordinate fallback:', fallbackAddress);
    return false;
  };
  
  // Handler for current location using GeolocationService
  const handleUseCurrentLocation = async (e) => {
    // Don't prevent default - let checkbox toggle naturally
    
    // If unchecking, just update the form data
    if (formData.useCurrentLocation) {
      updateFormData({ useCurrentLocation: false });
      return;
    }
    
    // Set useCurrentLocation: true immediately so checkbox shows checked
    updateFormData({ useCurrentLocation: true });
    setLoadingLocation(true);
    
    try {
      console.log('[LocationStep] Requesting current location using GeolocationService...');
      
      // Check if geolocation is supported and avoid problematic scenarios
      if (!navigator.geolocation) {
        console.log('Geolocation not supported, using default location');
        throw new Error('Geolocation not supported');
      }
      
      // Request high accuracy GPS
      const locationResult = await GeolocationService.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 30000, // 30 seconds to get GPS lock
        maximumAge: 0, // NO cached positions - always fresh GPS
        silentFallback: false
      });
      
      console.log('Location result:', locationResult);
      
      if (locationResult.success && locationResult.coords) {
        const { latitude, longitude, accuracy } = locationResult.coords;
        
        console.log(`[LocationStep] GPS obtained: ${latitude}, ${longitude} (accuracy: ${accuracy}m)`);
        
        setPosition([latitude, longitude]);
        updateFormData({ latitude, longitude, gps_accuracy: accuracy });

        // Reverse geocode to get address
        await reverseGeocode(latitude, longitude);

        // Show hint if accuracy is poor, but still accept the reading
        if (locationResult.accuracyWarning) {
          setGpsHint(`GPS accuracy is ${accuracy?.toFixed(0)}m. For better accuracy, move to an open area away from buildings.`);
          toastService.info(`Location captured (${accuracy?.toFixed(0)}m accuracy). Move outdoors for better precision.`);
        } else {
          setGpsHint('');
          toastService.success(`Location obtained! (Accuracy: ${accuracy?.toFixed(1) || 'N/A'}m)`);
        }
        setLoadingLocation(false);
        
      } else {
        // GPS completely failed - show error but don't block
        const errorMsg = locationResult.error?.message || 'Could not get GPS location';
        console.error('[LocationStep] GPS failed:', errorMsg);
        toastService.error(`GPS Error: ${errorMsg}`);
        updateFormData({ useCurrentLocation: false });
        setLoadingLocation(false);
      }
      
    } catch (error) {
      console.error('[LocationStep] GeolocationService error:', error);
      
      // NO FALLBACK - require actual GPS
      // Collectors need precise locations, cannot accept approximate positions
      toastService.error('Could not get GPS location. Please ensure location services are enabled and you are in an open area.');
      updateFormData({ useCurrentLocation: false });
      setLoadingLocation(false);
    }
  };
  
  // Handler for address input
  const handleAddressChange = (e) => {
    setAddressInput(e.target.value);
    updateFormData({
      address: e.target.value
    });
  };
  
  // Validate and proceed to next step
  const handleContinue = () => {
    if (!position || !position[0] || !position[1]) {
      setAddressError('Please select a valid location on the map');
      return;
    }

    if (!formData.useCurrentLocation) {
      setAddressError('Please use your current location to continue');
      return;
    }

    if (!addressInput.trim()) {
      setAddressError('Location address not found. Please try again.');
      return;
    }

    // Ensure we have valid coordinates before proceeding
    const [latitude, longitude] = position;
    updateFormData({
      latitude,
      longitude,
      address: addressInput.trim()
    });

    setAddressError('');
    nextStep();
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Digital Bin Location</h2>
      
      <div className="mb-4">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="useCurrentLocation"
            checked={formData.useCurrentLocation || false}
            onChange={handleUseCurrentLocation}
            className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
          />
          <label htmlFor="useCurrentLocation" className="ml-2 block text-sm text-gray-700 dark:text-gray-400">
            Use my current location <span className="text-red-500">*</span>
          </label>
        </div>
        {gpsHint && (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400 flex items-start">
            <svg className="w-4 h-4 mr-1.5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {gpsHint}
          </p>
        )}
      </div>
      
      <div className="mb-4">
        <label htmlFor="address" className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-1">
          Address
        </label>
        <input
          type="text"
          id="address"
          value={addressInput}
          readOnly
          placeholder="Use current location to auto-fill"
          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-600 text-gray-900 dark:text-white font-medium placeholder-gray-400 dark:placeholder-gray-500 cursor-not-allowed"
        />
        {addressError && (
          <p className="text-red-500 text-sm mt-1">{addressError}</p>
        )}
      </div>
      
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-1">
          Confirm on Map
        </label>
        <div className="h-48 rounded-lg overflow-hidden border border-gray-300">
          <MapContainer 
            center={position || [5.6037, -0.1870]} 
            zoom={13} 
            style={{ height: '100%', width: '100%' }}
            whenCreated={(map) => {
              map.on('click', (e) => {
                handlePositionChange([e.latlng.lat, e.latlng.lng]);
              });
            }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <MapUpdater position={position} />
            <DraggableMarker position={position} setPosition={handlePositionChange} />
          </MapContainer>
        </div>
      </div>
      
      {/* Hidden inputs to maintain coordinates in background */}
      {position && position[0] != null && position[1] != null && (
        <>
          <input type="hidden" value={position[0]} />
          <input type="hidden" value={position[1]} />
        </>
      )}
      
      <div className="flex justify-end mt-6 pb-4">
        <button
          type="button"
          onClick={handleContinue}
          className="bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-md transition-colors font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default LocationStep;
