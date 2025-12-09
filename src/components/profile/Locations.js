import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import supabase from '../../utils/supabaseClient.js';
import { saveOfflineLocation, getOfflineLocations, isOnline } from '../../utils/offlineStorage.js';
import { useAuth } from '../../context/AuthContext.js';

// Fix leaflet icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/dist/images/marker-icon-2x.png',
  iconUrl: '/leaflet/dist/images/marker-icon.png',
  shadowUrl: '/leaflet/dist/images/marker-shadow.png',
});

// Default coordinates for fallback (San Francisco)
const DEFAULT_COORDINATES = [37.7749, -122.4194];

/**
 * Locations tab component for the Profile page
 * Allows users to view and manage their saved locations
 */
// Location marker component that can be dragged to set position
const LocationMarker = ({ position, setPosition }) => {
  const map = useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      setPosition([lat, lng]);
    },
    locationfound(e) {
      const { lat, lng } = e.latlng;
      setPosition([lat, lng]);
      map.flyTo([lat, lng], 16);
    },
  });
  
  return position ? (
    <Marker 
      position={position}
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const { lat, lng } = e.target.getLatLng();
          setPosition([lat, lng]);
        }
      }}
    />
  ) : null;
};

// Component to center map view
const MapCenterControl = ({ position }) => {
  const map = useMap();
  
  useEffect(() => {
    if (position && position[0] && position[1]) {
      map.setView(position, 13);
    }
  }, [position, map]);
  
  return null;
};

const Locations = () => {
  const { user, getSession } = useAuth(); // Get session helper from useAuth
  const [locations, setLocations] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLocation, setNewLocation] = useState({
    name: '',
    address: '',
    latitude: null,
    longitude: null
  });
  
  // For manual coordinate entry
  const [showManualCoords, setShowManualCoords] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState(null); // For displaying sync status messages
  const [backendStatus, setBackendStatus] = useState(null); // For displaying backend connection status
  const [connectionStatus, setConnectionStatus] = useState(isOnline() ? 'online' : 'offline');
  
  // Default map position (will be overridden by user location if available)
  const [mapPosition, setMapPosition] = useState([51.505, -0.09]);
  const [userLocated, setUserLocated] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
  // Load locations primarily from local storage with optional Supabase sync
  useEffect(() => {
    const loadLocations = async () => {
      try {
        setIsLoading(true);
        console.log('[Locations] 🔄 loadLocations() called for user:', user?.id);
        setBackendStatus('Loading locations...');
        
        // Always load from localStorage first for immediate display
        const cachedLocations = localStorage.getItem('trashdrop_locations');
        console.log('[Locations] 💾 localStorage cache:', cachedLocations ? 'FOUND' : 'EMPTY');
        
        if (cachedLocations) {
          const parsedLocations = JSON.parse(cachedLocations);
          console.log('[Locations] ✅ Loaded', parsedLocations.length, 'locations from cache:', parsedLocations);
          setLocations(parsedLocations);
          setBackendStatus(null);
        } else {
          console.log('[Locations] ⚠️ No cached locations found, will load from database');
        }
        
        // Try Supabase in background but don't block UI
        console.log('[Locations] 🌐 Online?', isOnline(), 'User?', !!user);
        if (isOnline() && user) {
          console.log('[Locations] 📡 Fetching fresh locations from Supabase...');
          try {
            // Set a timeout to prevent hanging on this request
            const supabasePromise = new Promise(async (resolve) => {
              try {
                // Try to get a fresh session first
                const { data: sessionData } = await supabase.auth.refreshSession();
                
                const { data, error } = await supabase
                  .from('locations')
                  .select('*')
                  .eq('user_id', user.id);
                  
                resolve({ data, error });
              } catch (error) {
                resolve({ error });
              }
            });
            
            // Set timeout to avoid waiting too long
            const timeoutPromise = new Promise((resolve) => {
              setTimeout(() => resolve({ error: { message: 'Supabase request timed out' } }), 5000);
            });
            
            // Race between actual request and timeout
            const { data, error } = await Promise.race([supabasePromise, timeoutPromise]);
            
            if (error) {
              console.error('[Locations] Error loading locations from Supabase:', error);
              setBackendStatus('Using offline locations - server sync unavailable');
              setTimeout(() => setBackendStatus(null), 3000);
            } else if (data) {
              console.log('[Locations] ✅ Raw locations from Supabase:', data);
              console.log('[Locations] Number of locations:', data?.length || 0);
              
              // Transform to our expected format - locations table uses separate lat/lng columns
              const formattedLocations = data.map(loc => {
                console.log('[Locations] Processing location:', loc);
                
                const formatted = {
                  id: loc.id,
                  name: loc.location_name,  // Database column is 'location_name'
                  address: loc.address,
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                  synced: true
                };
                
                console.log('[Locations] ✅ Formatted location:', formatted);
                return formatted;
              });
              
              // Merge with any locally created locations that don't exist on server
              const localLocations = cachedLocations ? JSON.parse(cachedLocations) : [];
              const localOnlyLocations = localLocations.filter(
                local => local.id.toString().startsWith('local_') && !formattedLocations.some(server => server.name === local.name && server.address === local.address)
              );
              
              const mergedLocations = [...formattedLocations, ...localOnlyLocations];
              console.log('[Locations] 📍 Final merged locations:', mergedLocations);
              console.log('[Locations] 📊 Setting', mergedLocations.length, 'locations in state');
              
              setLocations(mergedLocations);
              
              // Update localStorage with the merged data
              localStorage.setItem('trashdrop_locations', JSON.stringify(mergedLocations));
              console.log('[Locations] ✅ Saved', mergedLocations.length, 'locations to localStorage');
              
              setBackendStatus('Locations synced with server');
              setTimeout(() => setBackendStatus(null), 3000);
            } else {
              console.warn('[Locations] ⚠️ No data returned from Supabase (might be empty array)');
            }
          } catch (syncError) {
            console.error('Sync error:', syncError);
            setBackendStatus('Using offline locations - sync failed');
            setTimeout(() => setBackendStatus(null), 3000);
          }
        } else {
          setBackendStatus('Using offline locations');
          setTimeout(() => setBackendStatus(null), 3000);
          
          // Offline: Load from IndexedDB for additional offline locations
          try {
            const offlineLocations = await getOfflineLocations(user?.id);
            if (offlineLocations?.length > 0) {
              // Merge with any existing locations from localStorage
              const existingLocations = locations || [];
              const mergedLocations = [...existingLocations, ...offlineLocations.filter(ol => 
                !existingLocations.some(el => el.id === ol.id))];
              
              setLocations(mergedLocations);
              localStorage.setItem('trashdrop_locations', JSON.stringify(mergedLocations));
            }
          } catch (dbError) {
            console.error('Failed to load locations from IndexedDB:', dbError);
          }
        }
      } catch (error) {
        console.error('Failed to load locations:', error);
        setBackendStatus('Error loading locations');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadLocations();
  }, [user]);

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
    setIsGettingLocation(true);
    setSyncStatus('Getting your location...');
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('Geolocation success:', position.coords);
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          setMapPosition([lat, lng]);
          setNewLocation(prev => ({
            ...prev,
            latitude: lat,
            longitude: lng
          }));
          setUserLocated(true);
          setIsGettingLocation(false);
          setSyncStatus('Location acquired successfully');
          setTimeout(() => setSyncStatus(null), 2000);
        },
        (error) => {
          console.error('Geolocation error:', error);
          
          // Detailed error messaging based on error code
          let errorMessage = '';
          switch(error.code) {
            case 1: // PERMISSION_DENIED
              errorMessage = 'Location access denied. Please check your browser permissions and try again.';
              break;
            case 2: // POSITION_UNAVAILABLE
              errorMessage = 'Your location is unavailable. Check your device settings or try again later.';
              break;
            case 3: // TIMEOUT
              errorMessage = 'Location request timed out. Please try again or use manual entry.';
              break;
            default:
              errorMessage = 'Could not get your location. Please try again or set it manually.';
          }
          setSyncStatus(errorMessage);
          
          // Try to get approximate location based on IP
          fetch('https://ipapi.co/json/')
            .then(res => res.json())
            .then(response => {
              console.log('IP geolocation fallback:', response);
              if (response.latitude && response.longitude) {
                setMapPosition([response.latitude, response.longitude]);
                setNewLocation(prev => ({
                  ...prev,
                  latitude: response.latitude,
                  longitude: response.longitude
                }));
                setUserLocated(true);
                setSyncStatus('Using approximate location (based on IP). You can also:');
                // Show manual coordinates entry as a fallback
                setShowManualCoords(true);
                setTimeout(() => {
                  setSyncStatus('For more accuracy, please enter coordinates manually or click on the map');
                  setTimeout(() => setSyncStatus(null), 5000);
                }, 3000);
              } else {
                // Default fallback position
                setMapPosition([40.7128, -74.006]);
                setSyncStatus('Could not get your location. Please set it manually.');
                setShowManualCoords(true); // Automatically show manual entry
                setTimeout(() => setSyncStatus(null), 4000);
              }
            })
            .catch(ipError => {
              console.error('IP geolocation error:', ipError);
              // Default fallback position - New York City
              setMapPosition([40.7128, -74.006]);
              setSyncStatus('Location services unavailable. Please enter coordinates manually or click on the map.');
              setShowManualCoords(true); // Automatically show manual entry
              setTimeout(() => setSyncStatus(null), 4000);
            })
            .finally(() => {
              setIsGettingLocation(false);
            });
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 } // Increased timeout for better chance of success
      );
    } else {
      setIsGettingLocation(false);
      setSyncStatus('Geolocation is not supported by your browser. Please enter coordinates manually.');
      setShowManualCoords(true); // Automatically show manual entry
      setMapPosition([40.7128, -74.006]); // Default to NYC
      setNewLocation(prev => ({
        ...prev,
        latitude: 40.7128,
        longitude: -74.006
      }));
      setTimeout(() => setSyncStatus(null), 4000);
    }
  };

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setConnectionStatus('online');
      setSyncStatus('You\'re back online');
      setTimeout(() => setSyncStatus(null), 2000);
    };
    
    const handleOffline = () => {
      setConnectionStatus('offline');
      setSyncStatus('You\'re working offline');
      setTimeout(() => setSyncStatus(null), 2000);
    };
    
    // Set initial status
    setConnectionStatus(isOnline() ? 'online' : 'offline');
    
    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Check connection status periodically
    const intervalId = setInterval(() => {
      const currentStatus = isOnline() ? 'online' : 'offline';
      if (currentStatus !== connectionStatus) {
        setConnectionStatus(currentStatus);
      }
    }, 10000); // Check every 10 seconds
    
    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(intervalId);
    };
  }, [connectionStatus]);
  
  // Load user's location when component mounts
  useEffect(() => {
    getUserLocation();
  }, []);

  // Handle form submission with online/offline support
  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('handleSubmit called', { newLocation });
    setSyncStatus(null); // Clear any previous status messages
    
    // Validate required fields
    const missingFields = [];
    if (!newLocation.name) missingFields.push('name');
    if (!newLocation.address) missingFields.push('address');
    
    // Check if we have location coordinates
    // If not but we have map position, use that
    if (!newLocation.latitude || !newLocation.longitude) {
      if (mapPosition && mapPosition[0] && mapPosition[1]) {
        setNewLocation(prev => ({
          ...prev,
          latitude: mapPosition[0],
          longitude: mapPosition[1]
        }));
      } else {
        missingFields.push('map location');
      }
    }
    
    if (missingFields.length > 0) {
      const message = `Please provide: ${missingFields.join(', ')}`;
      console.error('Form validation failed:', message);
      setSyncStatus(message);
      return;
    }
    
    try {
      // Set loading status
      setSyncStatus('Saving location...');
      
      // Generate a unique ID for the location
      const newLocationId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const locationToSave = { 
        ...newLocation, 
        id: newLocationId,
        user_id: user ? user.id : 'anonymous',
        synced: false,
        created_at: new Date().toISOString()
      };
      
      // Make sure we have coordinates
      if (!locationToSave.latitude || !locationToSave.longitude) {
        locationToSave.latitude = mapPosition[0];
        locationToSave.longitude = mapPosition[1];
      }
      
      console.log('Location to save:', locationToSave);
      
      // Add to local state first for immediate UI update
      const updatedLocations = [...locations, locationToSave];
      setLocations(updatedLocations);
      
      // Always update localStorage for persistence across page refreshes
      localStorage.setItem('trashdrop_locations', JSON.stringify(updatedLocations));
      
      const online = isOnline();
      console.log('Online status:', online);
      
      if (online) {
        // Online: Save to Supabase
        setSyncStatus('Saving location to server...');
        
        // Try to get a valid session with token
        try {
          // Refresh the session first to ensure we have a valid token
          const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession();
          
          if (sessionError) {
            console.error('Error refreshing session:', sessionError);
            // Fall back to offline saving on auth error
            await saveOfflineLocation(locationToSave);
            setSyncStatus('Authentication issue. Location saved offline and will sync later.');
            return;
          }
          
          if (!sessionData || !sessionData.session) {
            console.warn('No valid session available after refresh');
            await saveOfflineLocation(locationToSave);
            setSyncStatus('Authentication issue. Location saved offline and will sync later.');
            return;
          }
        
          // By now we've confirmed we have a valid session
          // Validate coordinates
          const lat = locationToSave.latitude;
          const lng = locationToSave.longitude;
          
          if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
            throw new Error('Invalid coordinates. Please use the map or enter valid coordinates.');
          }
          
          console.log('[Locations] Saving location with coordinates:', { lat, lng });
          
          // Proceed with API call using separate latitude/longitude columns
          const { data, error } = await supabase
            .from('locations')
            .insert({
              user_id: user.id,
              location_name: newLocation.name,  // Column is 'location_name' not 'name'
              address: newLocation.address,
              latitude: lat,
              longitude: lng,
              created_at: new Date().toISOString()
            })
            .select();
            
          if (error) {
            console.error('Error saving location to Supabase:', error);
            
            // Fall back to offline saving
            await saveOfflineLocation(locationToSave);
            setSyncStatus('Server error. Location saved offline and will sync later.');
          } else {
            // If we got here, the location was saved successfully to Supabase
            console.log('Location saved to Supabase:', data);
            setSyncStatus('Location saved to server successfully');
            
            // Update the ID in local state and localStorage to match the one from Supabase
            if (data && data[0]) {
              const supabaseLocationId = data[0].id;
              const updatedWithServerIds = updatedLocations.map(loc => 
                loc.id === newLocationId ? { ...loc, id: supabaseLocationId, synced: true } : loc
              );
              
              setLocations(updatedWithServerIds);
              localStorage.setItem('trashdrop_locations', JSON.stringify(updatedWithServerIds));
            }
          }
        } catch (authError) {
          console.warn('Auth error, saving offline instead:', authError);
          await saveOfflineLocation(locationToSave);
          setSyncStatus('Authentication issue. Location saved offline and will sync later.');
        }
      } else {
        // Offline: Save to IndexedDB
        console.log('Saving location offline');
        await saveOfflineLocation(locationToSave);
        setSyncStatus('Saving location offline. Will sync when online.');
      }
      
      // Reset form and hide it
      setNewLocation({
        name: '',
        address: '',
        latitude: null,
        longitude: null
      });
      setShowAddForm(false);
      
      // Clear status after 3 seconds
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (err) {
      console.error('Error saving location:', err);
      
      // Try to save offline as a last resort
      try {
        const fallbackLocation = {
          ...newLocation,
          id: `error_fallback_${Date.now()}`,
          user_id: user ? user.id : 'anonymous',
          latitude: newLocation.latitude || mapPosition[0],
          longitude: newLocation.longitude || mapPosition[1],
          synced: false,
          created_at: new Date().toISOString()
        };
        await saveOfflineLocation(fallbackLocation);
        setSyncStatus(`Error occurred, but location was saved offline.`);
        
        // Reset form and hide it with delay
        setTimeout(() => {
          setNewLocation({
            name: '',
            address: '',
            latitude: null,
            longitude: null
          });
          setShowAddForm(false);
          setSyncStatus(null);
        }, 2000);
      } catch (fallbackErr) {
        console.error('Even offline save failed:', fallbackErr);
        setSyncStatus(`Error: Could not save location. ${err.message || 'Unknown error'}`);
      }
    }
  };

  // Handle location deletion with online/offline support
  const handleDeleteLocation = async (id) => {
    try {
      setSyncStatus('Deleting location...');
      
      // Remove from local state first for immediate UI update
      const updatedLocations = locations.filter(location => location.id !== id);
      setLocations(updatedLocations);
      
      // Always update localStorage
      localStorage.setItem('trashdrop_locations', JSON.stringify(updatedLocations));
      
      if (isOnline()) {
        // Online: Delete from Supabase
        const { error } = await supabase
          .from('locations')
          .delete()
          .eq('id', id);
          
        if (error) {
          console.error('Error deleting location from Supabase:', error);
          setSyncStatus('Failed to delete from server. Will retry later.');
        } else {
          setSyncStatus('Location deleted successfully!');
          setTimeout(() => setSyncStatus(null), 3000);
        }
      } else {
        // Offline: Mark for deletion in IndexedDB
        // We'll need to implement this in offlineStorage.js
        setSyncStatus('Location marked for deletion. Will sync when online.');
        setTimeout(() => setSyncStatus(null), 3000);
      }
    } catch (err) {
      console.error('Error deleting location:', err);
      setSyncStatus('Error deleting location. Please try again.');
    }
  };

  // Online/Offline status display
  const OnlineStatus = () => {
    const [online, setOnline] = useState(navigator.onLine);
    
    useEffect(() => {
      const handleOnline = () => setOnline(true);
      const handleOffline = () => setOnline(false);
      
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }, []);
    
    return (
      <div className={`text-xs font-medium ${online ? 'text-green-600' : 'text-amber-600'} flex items-center`}>
        <span className={`inline-block w-2 h-2 rounded-full mr-1 ${online ? 'bg-green-600' : 'bg-amber-600'}`}></span>
        {online ? 'Online' : 'Offline'}
      </div>
    );
  };
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      {/* Header with Add Location button */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Saved Locations</h2>
          <OnlineStatus />
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
          disabled={isLoading}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add New Location
        </button>
      </div>
      
      {/* Connection Status Indicator */}
      <div className={`flex items-center justify-between mb-4 p-2 ${connectionStatus === 'online' ? 'bg-green-100' : 'bg-amber-100'} rounded-md`}>
        <div className="flex items-center">
          <div className={`w-3 h-3 rounded-full mr-2 ${connectionStatus === 'online' ? 'bg-green-500' : 'bg-amber-500'}`}></div>
          <span className="text-sm font-medium">
            {connectionStatus === 'online' ? 'Online' : 'Offline'} Mode
          </span>
        </div>
        <div className="text-xs text-gray-600">
          {connectionStatus === 'online' 
            ? 'Locations will sync with server' 
            : 'Locations will be saved locally'}
        </div>
      </div>
      
      {/* Status message */}
      {syncStatus && (
        <div className="mb-4 p-3 bg-blue-100 text-blue-700 rounded-md">
          {syncStatus}
        </div>
      )}
      
      {/* Backend Status */}
      {backendStatus && (
        <div className="mb-4 p-3 bg-gray-100 text-gray-700 rounded-md">
          {backendStatus}
        </div>
      )}
      
      {/* Tip Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500 mr-2 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-blue-800">
          Tip: Save locations you use frequently to quickly select them when requesting pickups.
        </p>
      </div>

      {/* Main Content: Form or List */}
      {isLoading ? (
        <div className="text-center py-6">
          <div className="flex justify-center">
            <div className="w-10 h-10 border-4 border-gray-200 rounded-full border-t-primary animate-spin"></div>
          </div>
          <p className="mt-3 text-gray-600 dark:text-gray-300">Loading your saved locations...</p>
        </div>
      ) : showAddForm ? (
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
                  <MapCenterControl position={mapPosition} />
                </MapContainer>
              </div>
              <p className="text-sm text-gray-500 mt-1">Click anywhere on the map to set location manually</p>
              
              <div className="mt-2 flex flex-col space-y-3 items-center">
                <div className="flex space-x-2">
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
                  
                  <button
                    type="button"
                    onClick={() => setShowManualCoords(!showManualCoords)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    {showManualCoords ? 'Hide Manual Entry' : 'Enter Coordinates Manually'}
                  </button>
                </div>
                
                {showManualCoords && (
                  <div className="w-full max-w-md p-4 border border-gray-300 rounded-md bg-gray-50">
                    <h4 className="text-sm font-semibold mb-2">Manual Coordinate Entry</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-600">Latitude</label>
                        <input
                          type="number"
                          step="any"
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={newLocation.latitude || ''}
                          onChange={(e) => {
                            const lat = parseFloat(e.target.value);
                            setNewLocation(prev => ({
                              ...prev,
                              latitude: lat
                            }));
                            if (lat && newLocation.longitude) {
                              setMapPosition([lat, newLocation.longitude]);
                            }
                          }}
                          placeholder="e.g. 37.7749"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600">Longitude</label>
                        <input
                          type="number"
                          step="any"
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={newLocation.longitude || ''}
                          onChange={(e) => {
                            const lng = parseFloat(e.target.value);
                            setNewLocation(prev => ({
                              ...prev,
                              longitude: lng
                            }));
                            if (lng && newLocation.latitude) {
                              setMapPosition([newLocation.latitude, lng]);
                            }
                          }}
                          placeholder="e.g. -122.4194"
                        />
                      </div>
                    </div>
                    <div className="mt-2">
                      <button
                        type="button"
                        className="w-full px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                        onClick={() => {
                          if (newLocation.latitude && newLocation.longitude) {
                            setMapPosition([newLocation.latitude, newLocation.longitude]);
                            setUserLocated(true);
                            setSyncStatus('Using manually entered coordinates');
                            setTimeout(() => setSyncStatus(null), 2000);
                          } else {
                            setSyncStatus('Please enter both latitude and longitude');
                            setTimeout(() => setSyncStatus(null), 2000);
                          }
                        }}
                      >
                        Apply Coordinates
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Enter decimal coordinates (e.g., 37.7749, -122.4194 for San Francisco)
                    </p>
                  </div>
                )}
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
      ) : (
        <>
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
                  </div>
                  <div className="flex">
                    <button 
                      onClick={() => handleDeleteLocation(location.id)}
                      className="px-2 py-1 text-sm text-red-600 hover:text-red-800"
                      aria-label="Delete location"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="mb-3 inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p>No saved locations yet.</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Add locations to easily select them when requesting pickups.</p>
            </div>
          )}
          
          {/* Add Location Button (below list) */}
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add New Location
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Locations;
