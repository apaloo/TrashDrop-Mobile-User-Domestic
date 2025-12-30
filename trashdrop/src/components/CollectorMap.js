import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Paper,
  Typography,
  Button,
  Box,
  Alert,
  CircularProgress,
  Fab,
  IconButton
} from '@mui/material';
import {
  LocationOn as LocationOnIcon,
  MyLocation as MyLocationIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext.js';
import { collectorService } from '../services/collectorService.js';
import GeolocationService from '../utils/geolocationService.js';

// Fix default Leaflet marker icons - use local files instead of unpkg
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/assets/marker-icon-2x.png',
  iconUrl: '/assets/marker-icon.png',
  shadowUrl: '/assets/marker-shadow.png',
});

// Create custom icon for current location
const currentLocationIcon = new L.Icon({
  iconUrl: '/assets/current-location.png',
  iconRetinaUrl: '/assets/current-location-2x.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const mapContainerStyle = {
  width: '100%',
  height: '400px'
};

const defaultCenter = [-1.286389, 36.817223]; // Nairobi coordinates [lat, lng]

const CollectorMap = ({ pickupLocation, onCollectorLocationUpdate }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collectors, setCollectors] = useState([]);
  const [selectedCollector, setSelectedCollector] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const locationUpdateInterval = useRef(null);

  // Get user's current location using improved GeolocationService
  useEffect(() => {
    const getUserLocation = async () => {
      try {
        setLoading(true);
        
        // If we have pickupLocation, use it and skip geolocation
        if (pickupLocation) {
          console.log('[CollectorMap] Using pickup location:', pickupLocation);
          setUserLocation(pickupLocation);
          setLoading(false);
          return;
        }
        
        const locationResult = await GeolocationService.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 300000 // 5 minutes
        });
        
        if (locationResult.success) {
          // Format coords to match the expected format in this component
          setUserLocation({
            lat: locationResult.coords.latitude,
            lng: locationResult.coords.longitude
          });
        } else {
          // Use default location as fallback
          console.warn('[CollectorMap] Using default location');
          setUserLocation({
            lat: defaultCenter[0],
            lng: defaultCenter[1]
          });
        }
        
      } catch (err) {
        console.error('[CollectorMap] Geolocation error:', err);
        // Use default location on error
        setUserLocation({
          lat: defaultCenter[0],
          lng: defaultCenter[1]
        });
      } finally {
        setLoading(false);
      }
    };
    
    getUserLocation();
  }, [pickupLocation]);

  // Fetch nearby collectors
  useEffect(() => {
    const fetchNearbyCollectors = async () => {
      const location = pickupLocation || userLocation;
      
      // Don't fetch if we don't have a valid location yet
      if (!location || !location.lat || !location.lng) {
        console.log('[CollectorMap] No valid location yet, skipping collector fetch');
        return;
      }

      try {
        console.log('[CollectorMap] Fetching collectors near:', location);
        const { data, error: fetchError } = await collectorService.getNearbyCollectors(
          location,
          5 // 5km radius
        );

        if (fetchError) throw new Error(fetchError.message);
        setCollectors(data || []);
        console.log('[CollectorMap] Found collectors:', data?.length || 0);

      } catch (err) {
        console.error('[CollectorMap] Error fetching collectors:', err);
        // Don't show error for missing location, just log it
        if (!err.message.includes('location')) {
          setError('Failed to fetch nearby collectors');
        }
      }
    };

    // Only start fetching if we have a location
    if (userLocation || pickupLocation) {
      fetchNearbyCollectors();
      // Refresh collectors every 30 seconds
      const interval = setInterval(fetchNearbyCollectors, 30000);
      return () => clearInterval(interval);
    }
  }, [userLocation, pickupLocation]);

  // Update collector location if user is a collector
  useEffect(() => {
    const updateCollectorLocation = async () => {
      if (!user?.is_collector || !userLocation) return;

      try {
        // Get or start collector session
        let session = null;
        const { data: activeSession } = await collectorService.getActiveSession(user.id);

        if (!activeSession) {
          const { data: newSession } = await collectorService.startSession(
            user.id,
            userLocation
          );
          session = newSession;
        } else {
          session = activeSession;
        }

        // Update location
        if (session) {
          await collectorService.updateLocation(session.id, userLocation);
          if (onCollectorLocationUpdate) {
            onCollectorLocationUpdate(userLocation);
          }
        }

      } catch (err) {
        console.error('Error updating collector location:', err);
      }
    };

    // Update location immediately and then every 30 seconds
    if (user?.is_collector) {
      updateCollectorLocation();
      locationUpdateInterval.current = setInterval(updateCollectorLocation, 30000);
    }

    return () => {
      if (locationUpdateInterval.current) {
        clearInterval(locationUpdateInterval.current);
      }
    };
  }, [user, userLocation]);

  // Cleanup collector session on unmount
  useEffect(() => {
    return () => {
      if (user?.is_collector) {
        collectorService.endActiveSession(user.id).catch(console.error);
      }
    };
  }, [user]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box sx={{ width: '100%', p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Nearby Collectors
      </Typography>

      <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
        <MapContainer
          center={pickupLocation ? [pickupLocation.lat, pickupLocation.lng] : 
                 userLocation ? [userLocation.lat, userLocation.lng] : defaultCenter}
          zoom={13}
          style={mapContainerStyle}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {/* User/Pickup Location Marker */}
          {(pickupLocation || userLocation) && (
            <Marker
              position={pickupLocation ? [pickupLocation.lat, pickupLocation.lng] : [userLocation.lat, userLocation.lng]}
            >
              <Popup>
                <div>
                  <strong>Pickup Location</strong>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Collector Markers */}
          {collectors.map((collector) => (
            <Marker
              key={collector.id}
              position={[collector.current_location.latitude, collector.current_location.longitude]}
              eventHandlers={{
                click: () => setSelectedCollector(collector),
              }}
            >
              <Popup>
                <div>
                  <strong>{collector.name}</strong><br/>
                  Distance: {collector.distance ? `${collector.distance.toFixed(1)}km` : 'Unknown'}<br/>
                  Status: {collector.status}<br/>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => {
                      // Handle collector selection
                      console.log('Selected collector:', collector);
                    }}
                  >
                    Select Collector
                  </Button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </Paper>

      <Typography variant="body2" color="text.secondary">
        {collectors.length} collectors found nearby
      </Typography>
    </Box>
  );
};

export default CollectorMap;
