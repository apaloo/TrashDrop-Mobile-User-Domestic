import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../context/AuthContext.js';
import { dumpingService } from '../services/dumpingService.js';
import { notificationService } from '../services/notificationService.js';
import CameraModal from './CameraModal.js';

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Component for handling map clicks
const LocationMarker = ({ position, setPosition, disabled }) => {
  const map = useMapEvents({
    click(e) {
      if (!disabled) {
        setPosition([e.latlng.lat, e.latlng.lng]);
      }
    },
  });
  return null;
};

const DumpingReportForm = ({ onSuccess }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [mapPosition, setMapPosition] = useState([5.614736, -0.208811]);
  const [showCamera, setShowCamera] = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [formData, setFormData] = useState({
    location: '',
    coordinates: null,
    description: '',
    waste_type: '',
    severity: 'Medium',
    estimated_volume: '',
    hazardous_materials: false,
    accessibility_notes: '',
    cleanup_priority: 'normal',
    photos: [],
    contact_consent: false
  });

  // Get user's current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          setUserLocation(location);
          setMapPosition([location.latitude, location.longitude]);
          setFormData(prev => ({
            ...prev,
            coordinates: location
          }));
        },
        (error) => {
          console.error('Geolocation error:', error);
          setError('Failed to get your location. Please enable location services.');
        }
      );
    } else {
      setError('Geolocation is not supported by your browser.');
    }
  }, []);

  const handleChange = (e) => {
    const { name, value, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: e.target.type === 'checkbox' ? checked : value
    }));
    setError(null);
  };

  const handleSeverityClick = (severity) => {
    setFormData(prev => ({
      ...prev,
      severity: severity
    }));
  };

  const handleUseMyLocation = () => {
    if (userLocation) {
      setMapPosition([userLocation.latitude, userLocation.longitude]);
      setFormData(prev => ({
        ...prev,
        coordinates: userLocation
      }));
    }
  };

  const handleMapClick = (latlng) => {
    setMapPosition([latlng.lat, latlng.lng]);
    setFormData(prev => ({
      ...prev,
      coordinates: {
        latitude: latlng.lat,
        longitude: latlng.lng
      }
    }));
  };

  const handleTakePhoto = () => {
    console.log('Opening camera modal...');
    setShowCamera(true);
  };
  
  // Handle camera close
  const handleCloseCamera = () => {
    console.log('Closing camera modal...');
    setShowCamera(false);
  };
  
  // Handle photo capture from CameraModal
  const handleCapturePhoto = (photo) => {
    console.log('Photo captured:', photo);
    setCapturedPhotos(prev => [...prev, photo]);
    setFormData(prev => ({
      ...prev,
      photos: [...prev.photos, photo.url]
    }));
  };
  
  // Remove photo from captured photos
  const removePhoto = (photoId) => {
    // Find the photo to remove
    const photoToRemove = capturedPhotos.find(photo => photo.id === photoId);
    if (!photoToRemove) return;
    
    // Update capturedPhotos state
    setCapturedPhotos(prev => prev.filter(photo => photo.id !== photoId));
    
    // Update formData photos as well
    setFormData(prev => ({
      ...prev,
      photos: prev.photos.filter(url => url !== photoToRemove.url)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Check if user is authenticated
    if (!user?.id) {
      setError('You must be logged in to submit a report.');
      return;
    }
    
    if (!formData.coordinates) {
      setError('Location is required. Please enable location services.');
      return;
    }

    if (!formData.waste_type) {
      setError('Please select a waste type.');
      return;
    }

    if (!formData.estimated_volume) {
      setError('Please select the size of the illegal dumping.');
      return;
    }

    if (formData.photos.length === 0) {
      setError('Please take at least one photo.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: reportError } = await dumpingService.createReport(
        user.id,
        formData
      );

      if (reportError) {
        throw new Error(reportError.message);
      }

      // Ensure we have valid report data before proceeding
      if (!data?.id) {
        throw new Error('Invalid report data received from server');
      }

      // Create notification for authorities
      try {
        await notificationService.createNotification(
          'authorities',
          'dumping_report',
          'New Illegal Dumping Report',
          `New dumping reported at ${formData.location || 'Unknown location'}`,
          {
            report_id: data.id,
            severity: formData.severity,
            coordinates: formData.coordinates
          }
        );
      } catch (notificationError) {
        console.warn('Failed to create notification:', notificationError);
        // Don't fail the whole process if notification fails
      }

      // Reset form
      setFormData({
        location: '',
        coordinates: userLocation,
        description: '',
        waste_type: '',
        severity: 'Medium',
        estimated_volume: '',
        hazardous_materials: false,
        accessibility_notes: '',
        cleanup_priority: 'normal',
        photos: [],
        contact_consent: false
      });

      // Call success callback
      if (onSuccess) {
        onSuccess(data);
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#374151', color: 'white' }}>
      <div className="px-4 py-6">
        {/* Header */}
        <h1 className="text-2xl font-bold text-white mb-6">
          Report Illegal Dumping
        </h1>

        {/* Info Box */}
        <div className="bg-blue-800 rounded-lg p-4 mb-6 flex items-start">
          <div className="bg-blue-600 rounded-full p-2 mr-3 mt-1 flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="text-gray-200">
            <p className="text-sm">
              Help keep our community clean by reporting illegal waste dumps. Your report will be sent to local authorities for cleanup. Photos can only be taken with your device's camera.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" noValidate>
          {/* Type of Waste */}
          <div className="mb-6">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Type of Waste <span className="text-red-400">*</span>
            </label>
            <select
              name="waste_type"
              value={formData.waste_type}
              onChange={handleChange}
              required
              autoComplete="off"
              className="w-full px-3 py-3 bg-gray-600 border border-gray-500 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            >
              <option value="">Select waste type</option>
              <option value="mixed">Mixed Waste</option>
              <option value="construction">Construction Debris</option>
              <option value="household">Household Waste</option>
              <option value="electronic">Electronic Waste</option>
              <option value="organic">Organic Waste</option>
              <option value="hazardous">Hazardous Materials</option>
            </select>
          </div>

          {/* Severity */}
          <div className="mb-6">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Severity <span className="text-red-400">*</span>
            </label>
            <div className="flex space-x-2">
              {['Low', 'Medium', 'High'].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => handleSeverityClick(level)}
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                    formData.severity === level
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Description (optional)
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              placeholder="Describe the dumped waste and any relevant details..."
              className="w-full px-3 py-3 bg-gray-600 border border-gray-500 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Size of dumping */}
          <div className="mb-6">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Size of the illegal dumping <span className="text-red-400">*</span>
            </label>
            <select
              name="estimated_volume"
              value={formData.estimated_volume}
              onChange={handleChange}
              required
              autoComplete="off"
              className="w-full px-3 py-3 bg-gray-600 border border-gray-500 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            >
              <option value="">Select a size option</option>
              <option value="small">Small (few bags)</option>
              <option value="medium">Medium (car load)</option>
              <option value="large">Large (truck load)</option>
              <option value="massive">Massive (multiple trucks)</option>
            </select>
          </div>

          {/* Location */}
          <div className="mb-6">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Location <span className="text-red-400">*</span>
            </label>
            <p className="text-gray-400 text-sm mb-3">
              We've automatically detected your location. You can click on the map to adjust it or use the button below to use your current location.
            </p>
            
            {/* Map */}
            <div className="mb-6">
              <label className="block mb-2 text-sm font-medium text-white">
                Pin Location <span className="text-red-500">*</span>
              </label>
              <div className="h-64 bg-gray-700 rounded-lg overflow-hidden">
                <MapContainer 
                  center={mapPosition} 
                  zoom={13} 
                  style={{ height: '100%', width: '100%', display: showCamera ? 'none' : 'block' }}
                  attributionControl={false}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  <LocationMarker position={mapPosition} setPosition={setMapPosition} disabled={showCamera} />
                  {mapPosition && <Marker position={mapPosition} />}
                </MapContainer>
                <button 
                  type="button"
                  className="absolute top-4 right-4 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-4 rounded-lg shadow"
                  onClick={handleUseMyLocation}
                >
                  Use My Location
                </button>
              </div>
            {/* Location coordinates */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-gray-400">
                <div>Lat: {userLocation?.latitude?.toFixed(6) || '5.614736'}</div>
                <div>Lng: {userLocation?.longitude?.toFixed(6) || '-0.208811'}</div>
              </div>
              <button
                type="button"
                onClick={handleUseMyLocation}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Use My Location
              </button>
            </div>
          </div>
          </div>

          {/* Take Photos */}
          <div className="mb-6">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Take Photos <span className="text-red-400">*</span>
            </label>
            
            {/* Photo Grid */}
            {capturedPhotos.length > 0 && (
              <div className="mb-4">
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {capturedPhotos.map((photo) => (
                    <div key={photo.id} className="relative">
                      <img 
                        src={photo.url} 
                        alt="Captured evidence" 
                        className="w-full h-32 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-700"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="border-2 border-dashed border-gray-500 rounded-lg p-8">
              <div className="text-center">
                <div className="mb-4">
                  <svg className="w-16 h-16 mx-auto text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                  </svg>
                </div>
                
                <button
                  type="button"
                  onClick={handleTakePhoto}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg mb-3 transition-colors"
                >
                  Take Photo with Camera
                </button>
                
                <p className="text-sm text-gray-400">
                  Add at least 1 photo (up to 6) to document the illegal dumping
                </p>
                <p className="text-xs text-blue-400 mt-2">
                  Note: Photos can only be taken with your device's camera
                </p>
                
                {capturedPhotos.length > 0 && (
                  <p className="text-sm text-green-400 mt-2">
                    ✓ {capturedPhotos.length} photo(s) captured
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Camera Modal */}
          {showCamera && (
            <CameraModal 
              onClose={handleCloseCamera}
              onCapture={handleCapturePhoto}
              maxPhotos={6}
              currentCount={capturedPhotos.length}
            />
          )}

          {/* Contact consent */}
          <div className="mb-6">
            <label className="flex items-start">
              <input
                type="checkbox"
                name="contact_consent"
                checked={formData.contact_consent}
                onChange={handleChange}
                className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 rounded focus:ring-blue-500 mt-0.5 mr-3"
              />
              <span className="text-gray-300 text-sm">
                I'm willing to be contacted for more information about this report
              </span>
            </label>
          </div>

          {/* Disclaimer */}
          <div className="mb-6 text-gray-400 text-sm">
            <p className="mb-2">
              By submitting this report, you confirm that the information provided is accurate to the best of your knowledge.
            </p>
            <p>
              <strong>Note:</strong> Photos can only be taken with your device's camera and cannot be selected from your gallery.
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !formData.waste_type || !formData.estimated_volume || formData.photos.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-4 px-6 rounded-lg transition-colors"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Submitting...
              </div>
            ) : (
              'Submit Report'
            )}
          </button>
        </form>
        
        {error && (
          <div className="mt-4 bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded-lg">
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DumpingReportForm;
