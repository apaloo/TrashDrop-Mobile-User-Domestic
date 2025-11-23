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
  
  // Default location: Accra, Ghana (consistent with geolocationService)
  const DEFAULT_LOCATION = [5.614736, -0.208811];
  
  const [position, setPosition] = useState(
    formData.latitude && formData.longitude 
      ? [formData.latitude, formData.longitude] 
      : DEFAULT_LOCATION
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
        // First check localStorage for immediate display
        const cachedLocations = localStorage.getItem('trashdrop_locations');
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
          
          // Merge with local storage data for any offline-saved locations
          const cachedLocations = localStorage.getItem('trashdrop_locations');
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
          
          // Update localStorage with merged data
          localStorage.setItem('trashdrop_locations', JSON.stringify(mergedLocations));
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
  
  // Handler for current location using GeolocationService
  const handleUseCurrentLocation = async (e) => {
    e.preventDefault();
    
    setLoadingLocation(true);
    
    try {
      console.log('Requesting current location using GeolocationService...');
      
      // Check if geolocation is supported and avoid problematic scenarios
      if (!navigator.geolocation) {
        console.log('Geolocation not supported, using default location');
        throw new Error('Geolocation not supported');
      }
      
      // Try a single, quick geolocation attempt with immediate fallback
      const locationPromise = GeolocationService.getCurrentPosition({
        enableHighAccuracy: false, // Never use high accuracy to avoid Google API
        timeout: 2000, // Very short timeout - just 2 seconds
        maximumAge: 600000, // 10 minutes - use cached positions aggressively
        silentFallback: false // Don't use service's internal fallback, we'll handle it
      });
      
      // Race the geolocation against a quick timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Quick timeout for immediate fallback')), 2500);
      });
      
      const locationResult = await Promise.race([locationPromise, timeoutPromise]);
      
      console.log('Location result:', locationResult);
      
      if (locationResult.success && locationResult.coords) {
        const { latitude, longitude } = locationResult.coords;
        
        setPosition([latitude, longitude]);
        updateFormData({
          latitude,
          longitude,
          useCurrentLocation: true
        });

        // Try to get address from coordinates using OpenStreetMap
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          
          if (response.ok) {
            const data = await response.json();
            if (data.display_name) {
              setAddressInput(data.display_name);
              updateFormData({
                address: data.display_name
              });
            }
          }
        } catch (geocodeError) {
          console.warn('Error getting address from coordinates:', geocodeError);
          // This is non-critical, continue without address
        }

        // Show success message based on source
        if (locationResult.source === 'default') {
          toastService.info('Using approximate location. You can adjust it on the map.');
        } else {
          toastService.success('Location obtained successfully!');
        }
        
        setLoadingLocation(false);
        
      } else {
        // GeolocationService already provided fallback coordinates
        const { latitude, longitude } = locationResult.coords;
        
        setPosition([latitude, longitude]);
        updateFormData({
          latitude,
          longitude,
          useCurrentLocation: false // Mark as not using current location since it's fallback
        });
        
        toastService.info('Using default location (Accra, Ghana). You can adjust it on the map.');
        setLoadingLocation(false);
      }
      
    } catch (error) {
      console.error('GeolocationService error:', error);
      
      // Use default location (Accra, Ghana) as fallback
      const [defaultLat, defaultLng] = DEFAULT_LOCATION;
      
      setPosition(DEFAULT_LOCATION);
      updateFormData({
        latitude: defaultLat,
        longitude: defaultLng,
        useCurrentLocation: false
      });
      
      toastService.info('Using default location (Accra, Ghana). Please adjust the marker on the map to your actual location.');
      
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

    if (!addressInput.trim()) {
      setAddressError('Please enter an address or select a location');
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
        <label htmlFor="address" className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-1">
          Address
        </label>
        <input
          type="text"
          id="address"
          value={addressInput}
          onChange={handleAddressChange}
          placeholder="Enter address or select from saved locations"
          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white bg-white dark:bg-gray-700 font-medium placeholder-gray-400 dark:placeholder-gray-500"
        />
        {addressError && (
          <p className="text-red-500 text-sm mt-1">{addressError}</p>
        )}
      </div>
      
      <div className="mb-4">
        <label htmlFor="savedLocation" className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-1">
          Saved Locations
        </label>
        <select
          id="savedLocation"
          onChange={handleLocationSelect}
          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white bg-white dark:bg-gray-700 font-medium"
        >
          <option value="">-- Select a saved location --</option>
          {savedLocations.map(location => (
            <option key={location.id} value={location.id}>
              {location.name} - {location.address}
            </option>
          ))}
        </select>
      </div>
      
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
            Use my current location
          </label>
        </div>
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
      
      {position && position[0] != null && position[1] != null && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-1">
              Latitude
            </label>
            <input
              type="text"
              value={position[0]?.toFixed(6) || ''}
              disabled
              className="w-full p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-1">
              Longitude
            </label>
            <input
              type="text"
              value={position[1]?.toFixed(6) || ''}
              disabled
              className="w-full p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-300"
            />
          </div>
        </div>
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
