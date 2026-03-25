import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../context/AuthContext.js';
import { dumpingServiceEnhanced } from '../services/dumpingServiceEnhanced.js';
import { toastService } from '../services/toastService.js';
import { useCallback } from 'react';
import { notificationService } from '../services/notificationService.js';
import CameraModal from './CameraModal.js';

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Component to handle map view updates when position changes
const MapViewController = ({ position }) => {
  const map = useMap();
  
  useEffect(() => {
    if (position && position.length === 2) {
      map.flyTo(position, 15, {
        duration: 1.5,
        easeLinearity: 0.25
      });
    }
  }, [position, map]);
  
  return null;
};

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

const DumpingReportFormEnhanced = ({ onSuccess }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [duplicateCheck, setDuplicateCheck] = useState(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [forceSubmit, setForceSubmit] = useState(false);

  // Default to Accra, Ghana coordinates
  const [mapPosition, setMapPosition] = useState([5.614736, -0.208811]);
  const [showCamera, setShowCamera] = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [formData, setFormData] = useState({
    location: '',
    coordinates: null,
    description: '',
    waste_type: '',
    severity: 'medium',
    estimated_volume: '',
    hazardous_materials: false,
    accessibility_notes: '',
    cleanup_priority: 'normal',
    photos: [],
    contact_consent: false
  });

  // Memoized toast notification functions
  const showErrorToast = useCallback((message) => {
    setTimeout(() => toastService.error(message), 0);
  }, []);
  
  const showSuccessToast = useCallback((message) => {
    setTimeout(() => toastService.success(message), 0);
  }, []);
  
  const showWarningToast = useCallback((message) => {
    setTimeout(() => toastService.warning(message), 0);
  }, []);

  // Camera modal state management
  useEffect(() => {
    setShowCamera(false);
    
    if (window.cameraStreamGlobal) {
      try {
        window.cameraStreamGlobal.getTracks().forEach(track => track.stop());
        window.cameraStreamGlobal = null;
      } catch (err) {
        console.error('Error cleaning up camera stream:', err);
      }
    }
    
    window.cameraModalMounted = false;
    localStorage.removeItem('cameraModalOpen');
    sessionStorage.removeItem('cameraClosed');
    
    return () => {
      if (window.cameraStreamGlobal) {
        try {
          window.cameraStreamGlobal.getTracks().forEach(track => track.stop());
          window.cameraStreamGlobal = null;
        } catch (err) {
          console.error('Error cleaning up camera stream on unmount:', err);
        }
      }
    };
  }, []);

  // Get user's current location on component mount
  useEffect(() => {
    handleUseMyLocation(false);
  }, []);

  // Check for nearby reports when coordinates change
  useEffect(() => {
    if (formData.coordinates && !forceSubmit) {
      const timer = setTimeout(() => {
        checkForNearbyReports();
      }, 1000); // Debounce for 1 second

      return () => clearTimeout(timer);
    }
  }, [formData.coordinates, forceSubmit]);

  const checkForNearbyReports = async () => {
    if (!formData.coordinates) return;

    try {
      setLoading(true);
      setError(null);
      
      const nearbyCheck = await dumpingServiceEnhanced.checkForNearbyReports(
        formData.coordinates,
        {
          radiusKm: 0.1, // 100m
          hoursBack: 24, // 24 hours
          excludeUserId: user?.id
        }
      );

      setDuplicateCheck(nearbyCheck);
      
      if (!nearbyCheck.error && nearbyCheck.summary.total > 0) {
        setShowDuplicateWarning(true);
        if (!nearbyCheck.recommendations.canSubmit) {
          setError(nearbyCheck.recommendations.message);
        }
      } else {
        setShowDuplicateWarning(false);
      }

    } catch (err) {
      console.warn('Nearby report check failed:', err);
      setShowDuplicateWarning(false);
    } finally {
      setLoading(false);
    }
  };

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
      severity: severity.toLowerCase()
    }));
  };

  const getGeolocationErrorMessage = (error) => {
    switch(error.code) {
      case error.PERMISSION_DENIED:
        return 'Location access denied. Using approximate location. You can adjust by tapping on the map.';
      case error.POSITION_UNAVAILABLE:
        return 'GPS signal unavailable. Using approximate location. You can adjust by tapping on the map.';
      case error.TIMEOUT:
        return 'Location request timed out. Using approximate location instead. You can adjust by tapping on the map.';
      default:
        return 'Location not available. Please select your location on the map.';
    }
  };

  const handleGeolocationFallback = useCallback((errorMessage) => {
    setError(errorMessage || 'Location not available. Please click on the map to set your location.');
    if (errorMessage) {
      showWarningToast(errorMessage);
    }
  }, [showWarningToast]);

  const handleUseMyLocation = useCallback((showFeedback = true) => {
    setError(null);
    
    if (navigator.geolocation) {
      try {
        if (showFeedback) {
          setLoading(true);
        }
        
        const options = {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0
        };
        
        navigator.geolocation.getCurrentPosition(
          (position) => {
            try {
              const location = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              };
              
              setFormData(prev => ({
                ...prev,
                coordinates: location
              }));
              
              setMapPosition([location.latitude, location.longitude]);
              setForceSubmit(false); // Reset force submit when getting new location
              
              if (showFeedback) {
                showSuccessToast('📍 Location updated successfully');
                setLoading(false);
              }
            } catch (processingError) {
              console.warn('Error processing location data:', processingError);
              handleGeolocationFallback('Could not process your location data');
              if (showFeedback) {
                setLoading(false);
              }
            }
          },
          (error) => {
            console.warn('Geolocation error:', error);
            handleGeolocationFallback(`${getGeolocationErrorMessage(error)}`);
            if (showFeedback) {
              setLoading(false);
            }
          },
          options
        );
      } catch (exception) {
        console.warn('Geolocation exception:', exception);
        handleGeolocationFallback('Unexpected error accessing location services');
        if (showFeedback) {
          setLoading(false);
        }
      }
    } else {
      handleGeolocationFallback('Geolocation is not supported by your browser');
      if (showFeedback) {
        setLoading(false);
      }
    }
  }, [handleGeolocationFallback, getGeolocationErrorMessage, setError, showSuccessToast]);

  const handleMapClick = (latlng) => {
    if (error && error.includes('location')) {
      setError(null);
    }
    
    setMapPosition([latlng.lat, latlng.lng]);
    setFormData(prev => ({
      ...prev,
      coordinates: {
        latitude: latlng.lat,
        longitude: latlng.lng
      }
    }));
    
    setForceSubmit(false); // Reset force submit when selecting new location
    showSuccessToast('Location selected successfully');
  };

  const handleTakePhoto = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!showCamera) {
      console.log('Opening camera modal...');
      
      if (window.cameraStreamGlobal) {
        try {
          window.cameraStreamGlobal.getTracks().forEach(track => track.stop());
          window.cameraStreamGlobal = null;
        } catch (err) {
          console.error('Error cleaning up camera stream before opening:', err);
        }
      }
      
      window.cameraModalMounted = false;
      setShowCamera(true);
    }
  };

  const handleCloseCamera = () => {
    setShowCamera(false);
    
    if (window.cameraStreamGlobal) {
      try {
        window.cameraStreamGlobal.getTracks().forEach(track => track.stop());
        window.cameraStreamGlobal = null;
      } catch (err) {
        console.error('Error stopping camera stream:', err);
      }
    }
    
    window.cameraModalMounted = false;
    localStorage.removeItem('cameraModalOpen');
    sessionStorage.removeItem('cameraClosed');
  };

  const handleCapturePhoto = (photo) => {
    try {
      if (!photo || !photo.url || !photo.id) {
        console.error('Invalid photo object received:', photo);
        showErrorToast('Invalid photo data received. Please try again.');
        return;
      }
      
      setLoading(true);
      
      requestAnimationFrame(() => {
        try {
          setCapturedPhotos(prev => {
            if (prev.some(p => p.id === photo.id)) {
              console.log('Photo already exists, not adding duplicate');
              setLoading(false);
              return prev;
            }
            
            if (prev.length >= 6) {
              console.log('Maximum photos reached, not adding more');
              showWarningToast('Maximum of 6 photos allowed.');
              setLoading(false);
              return prev;
            }
            
            const updated = [...prev, photo];
            
            const newUrls = updated.map(p => p.url);
            setFormData(prevForm => ({
              ...prevForm,
              photos: newUrls
            }));
            
            console.log(`Photo captured successfully. Total photos: ${updated.length}`);
            showSuccessToast(`📸 Photo ${updated.length} captured successfully!`);
            
            setTimeout(() => setLoading(false), 200);
            
            return updated;
          });
        } catch (stateError) {
          console.error('Error updating photo state:', stateError);
          showErrorToast('Failed to save photo. Please try again.');
          setLoading(false);
        }
      });
    } catch (error) {
      console.error('Error handling captured photo:', error);
      showErrorToast('Failed to process photo. Please try again.');
      setLoading(false);
    }
  };
  
  const removePhoto = (photoId) => {
    const photoToRemove = capturedPhotos.find(photo => photo.id === photoId);
    if (!photoToRemove) return;
    
    setCapturedPhotos(prev => prev.filter(photo => photo.id !== photoId));
    setFormData(prev => ({
      ...prev,
      photos: prev.photos.filter(url => url !== photoToRemove.url)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!user?.id) {
      setError('You must be logged in to submit a report.');
      return;
    }
    
    if (!formData.coordinates) {
      setError('Location is required. Please click on the map to select a location.');
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
      const result = await dumpingServiceEnhanced.createReportWithDuplicatePrevention(
        user.id,
        formData,
        {
          skipDuplicateCheck: forceSubmit,
          forceSubmit: forceSubmit
        }
      );

      if (result.error) {
        // Handle different types of duplicate errors
        if (result.error.code === 'CLIENT_DUPLICATE_DETECTED') {
          setError(result.error.message);
          return;
        } else if (result.error.code === 'NEARBY_REPORTS_EXIST') {
          setError(result.error.message);
          setShowDuplicateWarning(true);
          return;
        } else if (result.error.message?.includes('DUPLICATE')) {
          setError(result.error.message);
          return;
        }
        throw new Error(result.error.message);
      }

      if (!result?.data?.id) {
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
            report_id: result.data.id,
            severity: formData.severity,
            coordinates: formData.coordinates
          }
        );
      } catch (notificationError) {
        console.warn('Failed to create notification:', notificationError);
      }

      // Reset form
      setFormData({
        location: '',
        coordinates: null,
        description: '',
        waste_type: '',
        severity: 'medium',
        estimated_volume: '',
        hazardous_materials: false,
        accessibility_notes: '',
        cleanup_priority: 'normal',
        photos: [],
        contact_consent: false
      });

      setForceSubmit(false);
      setShowDuplicateWarning(false);
      setDuplicateCheck(null);

      if (onSuccess) {
        onSuccess(result.data);
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderDuplicateWarning = () => {
    if (!showDuplicateWarning || !duplicateCheck) return null;

    const { recommendations, summary, data: nearbyReports } = duplicateCheck;

    return (
      <div className={`p-4 rounded-lg mb-6 ${
        recommendations.canSubmit 
          ? 'bg-yellow-50 border border-yellow-200' 
          : 'bg-red-50 border border-red-200'
      }`}>
        <div className="flex items-start">
          <div className="flex-shrink-0">
            {recommendations.canSubmit ? (
              <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <div className="ml-3 flex-1">
            <h3 className={`text-sm font-medium ${
              recommendations.canSubmit ? 'text-yellow-800' : 'text-red-800'
            }`}>
              {recommendations.canSubmit ? 'Similar Reports Found' : 'Duplicate Reports Detected'}
            </h3>
            <div className={`mt-2 text-sm ${
              recommendations.canSubmit ? 'text-yellow-700' : 'text-red-700'
            }`}>
              <p>{recommendations.message}</p>
              
              {summary.total > 0 && (
                <div className="mt-2 text-xs">
                  <span className="font-medium">Summary:</span> {summary.total} total, 
                  {summary.recent} recent, {summary.nearby} nearby
                </div>
              )}
              
              {nearbyReports && nearbyReports.length > 0 && (
                <div className="mt-3 space-y-2">
                  <span className="text-xs font-medium">Nearby Reports:</span>
                  {nearbyReports.slice(0, 3).map((report, index) => (
                    <div key={report.id} className="text-xs bg-white bg-opacity-50 p-2 rounded">
                      <div className="flex justify-between">
                        <span>{Math.round(report.distance_meters)}m away</span>
                        <span>{Math.round(report.hours_ago)}h ago</span>
                      </div>
                      <div className="text-gray-600">
                        {report.waste_type} • {report.severity} • {report.size}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {!recommendations.canSubmit && (
              <div className="mt-4 flex space-x-2">
                <button
                  type="button"
                  onClick={() => setForceSubmit(true)}
                  className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                >
                  Submit Anyway
                </button>
                <button
                  type="button"
                  onClick={() => setShowDuplicateWarning(false)}
                  className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen pt-2 bg-white dark:bg-gray-900" style={{ minHeight: '100vh' }}>
      {/* Fixed Header */}
      <div className="px-4 py-4 fixed top-16 left-0 right-0 z-40 shadow-md bg-white dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-center">
          Report Illegal Dumping
        </h1>
      </div>
      
      <div className="px-4 py-2" style={{marginTop: '65px'}}>

        {/* Info Box */}
        <div className="bg-blue-50 dark:bg-blue-900 dark:bg-opacity-20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6 flex items-start">
          <div className="bg-blue-600 rounded-full p-2 mr-3 mt-1 flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="text-gray-700 dark:text-gray-300">
            <p className="text-sm">
              Help keep our community clean by reporting illegal waste dumps. Your report will be sent to local authorities for cleanup. 
              {forceSubmit && <span className="font-medium text-red-600"> Force submit mode enabled.</span>}
            </p>
          </div>
        </div>

        {/* Duplicate Warning */}
        {renderDuplicateWarning()}

        <form onSubmit={handleSubmit} autoComplete="off" noValidate>
          {/* Map for location selection */}
          <div className="mb-6">
            <label className="block text-gray-700 dark:text-gray-300 text-sm font-medium mb-2">
              Location <span className="text-red-500">*</span>
            </label>
            <div className="bg-gray-100 rounded-lg overflow-hidden" style={{ height: '300px' }}>
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
                  position={mapPosition}
                  setPosition={setMapPosition}
                  disabled={loading}
                />
                <MapViewController position={mapPosition} />
              </MapContainer>
            </div>
            <div className="mt-2 flex justify-between">
              <button
                type="button"
                onClick={() => handleUseMyLocation(true)}
                disabled={loading}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              >
                📍 Use My Location
              </button>
              {formData.coordinates && (
                <span className="text-xs text-gray-500">
                  Selected: {formData.coordinates.latitude.toFixed(6)}, {formData.coordinates.longitude.toFixed(6)}
                </span>
              )}
            </div>
          </div>

          {/* Rest of the form fields (waste type, severity, size, description, photos) */}
          {/* [Include all the existing form fields from the original component] */}

          {/* Error display */}
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          {/* Submit button */}
          <div className="mt-6">
            <button
              type="submit"
              disabled={loading || !formData.coordinates || !formData.waste_type || !formData.estimated_volume || formData.photos.length === 0}
              className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                'Submit Report'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Camera Modal */}
      {showCamera && (
        <CameraModal
          onCapture={handleCapturePhoto}
          onClose={handleCloseCamera}
          maxPhotos={6}
          existingPhotos={capturedPhotos}
        />
      )}
    </div>
  );
};

export default DumpingReportFormEnhanced;
