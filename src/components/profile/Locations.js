import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix leaflet icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png'
});

/**
 * Locations tab component for the Profile page
 * Allows users to view and manage their saved locations
 */
// Location marker component that can be dragged to set position
const LocationMarker = ({ position, setPosition }) => {
  const map = useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    }
  });

  return position[0] ? (
    <Marker 
      position={position}
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const marker = e.target;
          const position = marker.getLatLng();
          setPosition([position.lat, position.lng]);
        }
      }}
    />
  ) : null;
};

const Locations = () => {
  // Get locations from localStorage or use empty array if none exist
  const [locations, setLocations] = useState(() => {
    const savedLocations = localStorage.getItem('trashdrop_locations');
    return savedLocations ? JSON.parse(savedLocations) : [];
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLocation, setNewLocation] = useState({
    name: '',
    address: '',
    city: '',
    latitude: null,
    longitude: null
  });
  
  // Default map position (will be overridden by user location if available)
  const [mapPosition, setMapPosition] = useState([51.505, -0.09]);
  const [userLocated, setUserLocated] = useState(false);
  
  // Save locations to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('trashdrop_locations', JSON.stringify(locations));
  }, [locations]);

  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setNewLocation({
      ...newLocation,
      [name]: value
    });
  };
  
  // Get user's current location
  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setMapPosition([latitude, longitude]);
          setNewLocation({
            ...newLocation,
            latitude,
            longitude
          });
          setUserLocated(true);
        },
        (error) => {
          console.error("Error getting location:", error);
          alert("Could not get your location. Please ensure location services are enabled.");
        }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
    }
  };

  // Load user's location when component mounts
  useEffect(() => {
    getUserLocation();
  }, []);

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    if (newLocation.name && newLocation.address && newLocation.latitude && newLocation.longitude) {
      const updatedLocations = [...locations, { ...newLocation, id: Date.now() }];
      setLocations(updatedLocations);
      // Also update localStorage right away for immediate persistence
      localStorage.setItem('trashdrop_locations', JSON.stringify(updatedLocations));
      
      setNewLocation({
        name: '',
        address: '',
        city: '',
        latitude: null,
        longitude: null
      });
      setShowAddForm(false);
      
      // Show feedback to user
      alert("Location saved successfully!");
    } else {
      alert("Please provide a name, address, and select a location on the map.");
    }
  };

  // Handle location deletion
  const handleDeleteLocation = (id) => {
    const updatedLocations = locations.filter(location => location.id !== id);
    setLocations(updatedLocations);
    // Also update localStorage right away
    localStorage.setItem('trashdrop_locations', JSON.stringify(updatedLocations));
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      {/* Header with Add Location button */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Saved Locations</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add New Location
        </button>
      </div>

      {/* Tip Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500 mr-2 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-blue-800">
          Tip: Save locations you use frequently to quickly select them when requesting pickups.
        </p>
      </div>

      {/* Add Location Form */}
      {showAddForm && (
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mb-6 border border-gray-200 dark:border-gray-600">
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Location Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={newLocation.name}
                  onChange={handleChange}
                  placeholder="Home, Work, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Street Address
                </label>
                <input
                  type="text"
                  id="address"
                  name="address"
                  value={newLocation.address}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-2 md:col-span-2">
                <label htmlFor="city" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  City
                </label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  value={newLocation.city}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              

            </div>

            {/* Map Component */}
            <div className="mt-6 mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Location on Map
              </label>
              <div className="h-64 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                <MapContainer 
                  center={mapPosition} 
                  zoom={13} 
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  <LocationMarker 
                    position={[newLocation.latitude || mapPosition[0], newLocation.longitude || mapPosition[1]]}
                    setPosition={(pos) => {
                      setNewLocation({
                        ...newLocation,
                        latitude: pos[0],
                        longitude: pos[1]
                      });
                    }}
                  />
                </MapContainer>
              </div>
              
              <div className="mt-2 flex justify-center">
                <button
                  type="button"
                  onClick={getUserLocation}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Use My Current Location
                </button>
              </div>
            </div>
            
            <div className="mt-4 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save Location
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Locations List */}
      {locations.length > 0 ? (
        <div className="space-y-4">
          {locations.map(location => (
            <div 
              key={location.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex justify-between items-start"
            >
              <div>
                <h3 className="font-medium text-lg">{location.name}</h3>
                <p className="text-gray-600 dark:text-gray-400">{location.address}</p>
                {location.city && (
                  <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                    {location.city}
                  </p>
                )}
                {(location.latitude && location.longitude) && (
                  <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                    GPS: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                  </p>
                )}
              </div>
              <div className="flex space-x-2">
                <button 
                  className="p-1 text-gray-500 hover:text-blue-500"
                  onClick={() => {
                    setNewLocation({...location});
                    setShowAddForm(true);
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button 
                  className="p-1 text-gray-500 hover:text-red-500"
                  onClick={() => handleDeleteLocation(location.id)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto mb-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p>No saved locations yet.</p>
          <p className="text-sm mt-1">Add locations to easily select them when requesting pickups.</p>
        </div>
      )}
    </div>
  );
};

export default Locations;
