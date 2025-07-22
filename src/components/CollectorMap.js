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
import { useAuth } from '../contexts/AuthContext.js';
import { collectorService } from '../services/collectorService.js';

// Fix default Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
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

  // Get user's current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setLoading(false);
        },
        (error) => {
          console.error('Geolocation error:', error);
          setError('Failed to get your location. Please enable location services.');
          setLoading(false);
        }
      );
    } else {
      setError('Geolocation is not supported by your browser.');
      setLoading(false);
    }
  }, []);

  // Fetch nearby collectors
  useEffect(() => {
    const fetchNearbyCollectors = async () => {
      if (!userLocation && !pickupLocation) return;

      const location = pickupLocation || userLocation;
      try {
        const { data, error: fetchError } = await collectorService.getNearbyCollectors(
          location,
          5 // 5km radius
        );

        if (fetchError) throw new Error(fetchError.message);
        setCollectors(data);

      } catch (err) {
        console.error('Error fetching collectors:', err);
        setError('Failed to fetch nearby collectors');
      }
    };

    fetchNearbyCollectors();
    // Refresh collectors every 30 seconds
    const interval = setInterval(fetchNearbyCollectors, 30000);
    return () => clearInterval(interval);
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
