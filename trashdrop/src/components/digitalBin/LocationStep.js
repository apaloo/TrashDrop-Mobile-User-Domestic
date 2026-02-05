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

  // Initialize form data with default values if not provided
  useEffect(() => {
    updateFormData({
      ...formData,
      latitude: formData.latitude || position[0],
      longitude: formData.longitude || position[1],
      address: formData.address || '',
      useCurrentLocation: formData.useCurrentLocation || false
    });
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
        
        // Then fetch from Supabase to ensure we have the latest
        const { data, error } = await supabase
          .from('locations')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          // Format locations to match component's expected structure
          const formattedLocations = data.map(location => ({
            id: location.id,
            name: location.name,
            address: location.address || '',
            city: location.city || '',
            latitude: location.latitude,
            longitude: location.longitude,
            synced: true
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
      // Note: User-Agent cannot be set in browser fetch (forbidden header)
      // Use email parameter for identification per Nominatim usage policy
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&email=support@trashdrop.app`
      );
      
      console.log('[LocationStep] Nominatim response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[LocationStep] Reverse geocoding result:', data);
        if (data.display_name) {
          setAddressInput(data.display_name);
          updateFormData({ address: data.display_name });
          console.log('[LocationStep] Address set to:', data.display_name);
          return true;
        }
      }
    } catch (error) {
      console.warn('[LocationStep] Reverse geocoding error:', error);
    }
    
    // Fallback to coordinates
    const fallbackAddress = `Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
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
      
      // STRICT GPS: High accuracy required, no caching
      // Collectors need precise locations (≤5m accuracy)
      const locationResult = await GeolocationService.getCurrentPosition({
        enableHighAccuracy: true, // REQUIRED for ≤5m accuracy
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

        toastService.success(`Location obtained! (Accuracy: ${accuracy?.toFixed(1) || 'N/A'}m)`);
        setLoadingLocation(false);
        
      } else {
        // GPS failed to meet accuracy requirements - show error
        const errorMsg = locationResult.error?.message || 'Could not get precise GPS location';
        console.error('[LocationStep] GPS failed:', errorMsg);
        toastService.error(`GPS Error: ${errorMsg}. Please move to an open area and try again.`);
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
            center={position} 
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
