import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import supabase from '../../utils/supabaseClient.js';
import { useAuth } from '../../context/AuthContext.js';

// Fix for default marker icon in Leaflet with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Draggable marker component
const DraggableMarker = ({ position, setPosition }) => {
  const map = useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });

  return position ? 
    <Marker 
      position={position} 
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const marker = e.target;
          const position = marker.getLatLng();
          setPosition([position.lat, position.lng]);
        },
      }}
    /> : null;
};

const LocationStep = ({ formData, updateFormData, nextStep }) => {
  const { user } = useAuth();
  const [position, setPosition] = useState(
    formData.latitude && formData.longitude 
      ? [formData.latitude, formData.longitude] 
      : [40.7128, -74.0060] // Default to NYC
  );
  const [savedLocations, setSavedLocations] = useState([]);
  const [addressInput, setAddressInput] = useState(formData.address ?? '');
  const [addressError, setAddressError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
          .from('locations') // Use the correct table name
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
          
          // Keep localStorage in sync
          localStorage.setItem('trashdrop_locations', JSON.stringify(mergedLocations));
        } else {
          // Check if we already have locations in localStorage
          const cachedLocations = localStorage.getItem('trashdrop_locations');
          if (!cachedLocations) {
            console.log('No saved locations found for user in LocationStep');
          }
        }
      } catch (error) {
        console.error('Error loading saved locations in LocationStep:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSavedLocations();
  }, [user]);

  // Handler for setting position from map
  const handlePositionChange = (newPosition) => {
    setPosition(newPosition);
    updateFormData({
      latitude: newPosition[0],
      longitude: newPosition[1]
    });
  };

  // Handler for saved location selection
  const handleLocationSelect = (e) => {
    const locationId = e.target.value;
    if (locationId) {
      const selectedLocation = savedLocations.find(loc => loc.id === locationId);
      if (selectedLocation) {
        setPosition([selectedLocation.latitude, selectedLocation.longitude]);
        setAddressInput(selectedLocation.address);
        updateFormData({
          address: selectedLocation.address,
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude
        });
      }
    }
  };

  // Handler for current location
  const handleUseCurrentLocation = (e) => {
    const useCurrentLoc = e.target.checked;
    updateFormData({ useCurrentLocation: useCurrentLoc });
    
    if (useCurrentLoc) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const newPosition = [position.coords.latitude, position.coords.longitude];
            setPosition(newPosition);
            updateFormData({
              latitude: newPosition[0],
              longitude: newPosition[1],
              useCurrentLocation: true
            });
          },
          (error) => {
            console.error('Error getting location:', error);
            updateFormData({ useCurrentLocation: false });
          }
        );
      }
    }
  };

  // Handler for address input
  const handleAddressChange = (e) => {
    setAddressInput(e.target.value);
    updateFormData({ address: e.target.value });
  };

  // Validate and proceed to next step
  const handleContinue = () => {
    if (!addressInput.trim() && !formData.useCurrentLocation) {
      setAddressError('Please enter an address or use your current location');
      return;
    }
    
    if (!formData.latitude || !formData.longitude) {
      setAddressError('Please select a location on the map');
      return;
    }
    
    nextStep();
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Pickup Location</h2>
      
      <div className="mb-4">
        <label htmlFor="address" className="block text-sm font-medium text-gray-900 mb-1">
          Address
        </label>
        <input
          type="text"
          id="address"
          value={addressInput}
          onChange={handleAddressChange}
          placeholder="Enter address or select from saved locations"
          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 font-medium"
        />
        {addressError && (
          <p className="text-red-500 text-sm mt-1">{addressError}</p>
        )}
      </div>
      
      <div className="mb-4">
        <label htmlFor="savedLocation" className="block text-sm font-medium text-gray-900 mb-1">
          Saved Locations
        </label>
        <select
          id="savedLocation"
          onChange={handleLocationSelect}
          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 font-medium"
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
            checked={formData.useCurrentLocation}
            onChange={handleUseCurrentLocation}
            className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
          />
          <label htmlFor="useCurrentLocation" className="ml-2 block text-sm text-gray-700">
            Use my current location
          </label>
        </div>
      </div>
      
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-900 mb-1">
          Confirm on Map
        </label>
        <div className="h-64 rounded-lg overflow-hidden border border-gray-300">
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
            <DraggableMarker position={position} setPosition={handlePositionChange} />
          </MapContainer>
        </div>
      </div>
      
      {position && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Latitude
            </label>
            <input
              type="text"
              value={position[0]}
              disabled
              className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Longitude
            </label>
            <input
              type="text"
              value={position[1]}
              disabled
              className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md"
            />
          </div>
        </div>
      )}
      
      <div className="flex justify-end mt-6">
        <button
          type="button"
          onClick={handleContinue}
          className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-md transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default LocationStep;
