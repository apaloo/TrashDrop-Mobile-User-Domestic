import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../context/AuthContext.js';
import { dumpingService } from '../services/dumpingService.js';
import { toastService } from '../services/toastService.js';
import { useCallback } from 'react'; // Add useCallback for toast functions
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
      // Fly to the new position with smooth animation
      map.flyTo(position, 15, {
        duration: 1.5, // Animation duration in seconds
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

const DumpingReportForm = ({ onSuccess }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Default to Accra, Ghana coordinates so map can render immediately
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

  // Memoized toast notification functions to prevent render-time calls
  const showErrorToast = useCallback((message) => {
    setTimeout(() => toastService.error(message), 0);
  }, []);
  
  const showSuccessToast = useCallback((message) => {
    setTimeout(() => toastService.success(message), 0);
  }, []);
  
  const showWarningToast = useCallback((message) => {
    setTimeout(() => toastService.warning(message), 0);
  }, []);

  // No default coordinates - require actual GPS location
  
  // Camera modal state management - simplified approach
  useEffect(() => {
    // Ensure camera is not shown on initial mount and clean up any resources
    setShowCamera(false);
    
    // Clean up any global camera references
    if (window.cameraStreamGlobal) {
      try {
        window.cameraStreamGlobal.getTracks().forEach(track => track.stop());
        window.cameraStreamGlobal = null;
        console.log('Cleaned up global camera stream on form initialization');
      } catch (err) {
        console.error('Error cleaning up camera stream:', err);
      }
    }
    
    // Reset global modal state flag
    window.cameraModalMounted = false;
    
    // Clear any persisted camera state
    localStorage.removeItem('cameraModalOpen');
    sessionStorage.removeItem('cameraClosed');
    
    return () => {
      // Clean up on component unmount
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
    // Try to get current location immediately - no default
    handleUseMyLocation(false);
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
      severity: severity.toLowerCase() // Ensure lowercase values for backend validation
    }));
  };

  // Helper to get user-friendly geolocation error messages
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

  // Helper to handle geolocation fallback
  const handleGeolocationFallback = useCallback((errorMessage) => {
    // Keep the default Accra coordinates that map is already showing
    // User can click on map to adjust location
    setError(errorMessage || 'Location not available. Please click on the map to set your location.');
    
    // Show warning toast
    if (errorMessage) {
      showWarningToast(errorMessage);
    }
  }, [showWarningToast]);

  const handleUseMyLocation = useCallback((showFeedback = true) => {
    // Clear any previous errors
    setError(null);
    
    if (navigator.geolocation) {
      try {
        if (showFeedback) {
          setLoading(true);
        }
        
        const options = {
          enableHighAccuracy: true, // REQUIRED for ≤5m accuracy
          timeout: 30000, // 30 seconds to get GPS lock
          maximumAge: 0 // NO cached positions - always fresh GPS
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
              
              // Show success message only if explicitly requested
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
    // Clear any location errors when user manually selects location
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
    
    // Show success toast message
    showSuccessToast('Location selected successfully');
  };

  const handleTakePhoto = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only allow opening camera if we're not already showing it
    if (!showCamera) {
      console.log('Opening camera modal...');
      
      // Clean up any existing camera resources first
      if (window.cameraStreamGlobal) {
        try {
          window.cameraStreamGlobal.getTracks().forEach(track => track.stop());
          window.cameraStreamGlobal = null;
        } catch (err) {
          console.error('Error cleaning up camera stream before opening:', err);
        }
      }
      
      // Reset modal state
      window.cameraModalMounted = false;
      
      // Show the camera modal
      setShowCamera(true);
    } else {
      console.log('Camera modal already open, ignoring request');
    }
  };

  const handleCloseCamera = () => {
    // Hide the modal
    setShowCamera(false);
    
    // Clean up camera resources
    if (window.cameraStreamGlobal) {
      try {
        window.cameraStreamGlobal.getTracks().forEach(track => track.stop());
        window.cameraStreamGlobal = null;
      } catch (err) {
        console.error('Error stopping camera stream:', err);
      }
    }
    
    // Reset flags and stored state
    window.cameraModalMounted = false;
    localStorage.removeItem('cameraModalOpen');
    sessionStorage.removeItem('cameraClosed');
  };

  const handleCapturePhoto = (photo) => {
    try {
      console.log('Photo captured. Size:', photo?.blob?.size || 'unknown');
      
      // Verify photo has the required properties
      if (!photo || !photo.url || !photo.id) {
        console.error('Invalid photo object received:', photo);
        showErrorToast('Invalid photo data received. Please try again.');
        return;
      }
      
      // Temporarily disable form submission during photo processing
      setLoading(true);
      
      // Use requestAnimationFrame to ensure DOM is stable before state updates
      requestAnimationFrame(() => {
        try {
          setCapturedPhotos(prev => {
            // Don't add if the photo ID already exists (prevent duplicates)
            if (prev.some(p => p.id === photo.id)) {
              console.log('Photo already exists, not adding duplicate');
              setLoading(false);
              return prev;
            }
            
            // Limit to 6 photos maximum
            if (prev.length >= 6) {
              console.log('Maximum photos reached, not adding more');
              showWarningToast('Maximum of 6 photos allowed.');
              setLoading(false);
              return prev;
            }
            
            const updated = [...prev, photo];
            
            // Update formData photos synchronously to avoid race conditions
            const newUrls = updated.map(p => p.url);
            setFormData(prevForm => ({
              ...prevForm,
              photos: newUrls
            }));
            
            // Show success message with accurate count
            console.log(`Photo captured successfully. Total photos: ${updated.length}`);
            showSuccessToast(`📸 Photo ${updated.length} captured successfully!`);
            
            // Re-enable form after successful photo processing
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
    <div className="min-h-screen pt-2 bg-white dark:bg-gray-900" style={{ minHeight: '100vh' }}>
      {/* Fixed Header (positioned below navbar) */}
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
              Help keep our community clean by reporting illegal waste dumps. Your report will be sent to local authorities for cleanup. Photos can only be taken with your device's camera.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" noValidate>
          {/* Type of Waste - Horizontal Scrollable Cards */}
          <div className="mb-6">
            <label className="block text-gray-700 dark:text-gray-300 text-sm font-medium mb-2">
              Type of Waste <span className="text-red-500">*</span>
            </label>
            
            {/* Horizontal scrollable container */}
            <div 
              className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1"
              style={{
                scrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
            >
              {/* Mixed Waste Card */}
              <div
                onClick={() => setFormData(prev => ({ ...prev, waste_type: 'mixed' }))}
                className={`flex-shrink-0 w-24 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  formData.waste_type === 'mixed'
                    ? 'bg-blue-50 dark:bg-blue-900 border-2 border-blue-500 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-1">🗑️</div>
                  <span className={`text-xs font-medium ${
                    formData.waste_type === 'mixed' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Mixed
                  </span>
                </div>
              </div>

              {/* Construction Debris Card */}
              <div
                onClick={() => setFormData(prev => ({ ...prev, waste_type: 'construction' }))}
                className={`flex-shrink-0 w-24 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  formData.waste_type === 'construction'
                    ? 'bg-blue-50 dark:bg-blue-900 border-2 border-blue-500 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-1">🧱</div>
                  <span className={`text-xs font-medium ${
                    formData.waste_type === 'construction' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Construction
                  </span>
                </div>
              </div>

              {/* Household Waste Card */}
              <div
                onClick={() => setFormData(prev => ({ ...prev, waste_type: 'household' }))}
                className={`flex-shrink-0 w-24 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  formData.waste_type === 'household'
                    ? 'bg-blue-50 dark:bg-blue-900 border-2 border-blue-500 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-1">🏠</div>
                  <span className={`text-xs font-medium ${
                    formData.waste_type === 'household' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Household
                  </span>
                </div>
              </div>

              {/* Electronic Waste Card */}
              <div
                onClick={() => setFormData(prev => ({ ...prev, waste_type: 'electronic' }))}
                className={`flex-shrink-0 w-24 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  formData.waste_type === 'electronic'
                    ? 'bg-blue-50 dark:bg-blue-900 border-2 border-blue-500 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-1">📱</div>
                  <span className={`text-xs font-medium ${
                    formData.waste_type === 'electronic' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Electronic
                  </span>
                </div>
              </div>

              {/* Organic Waste Card */}
              <div
                onClick={() => setFormData(prev => ({ ...prev, waste_type: 'organic' }))}
                className={`flex-shrink-0 w-24 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  formData.waste_type === 'organic'
                    ? 'bg-blue-50 dark:bg-blue-900 border-2 border-blue-500 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-1">🥬</div>
                  <span className={`text-xs font-medium ${
                    formData.waste_type === 'organic' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Organic
                  </span>
                </div>
              </div>

              {/* Recyclables Card */}
              <div
                onClick={() => setFormData(prev => ({ ...prev, waste_type: 'recyclables' }))}
                className={`flex-shrink-0 w-24 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  formData.waste_type === 'recyclables'
                    ? 'bg-blue-50 dark:bg-blue-900 border-2 border-blue-500 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-1">♻️</div>
                  <span className={`text-xs font-medium ${
                    formData.waste_type === 'recyclables' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Recyclables
                  </span>
                </div>
              </div>

              {/* Hazardous Materials Card */}
              <div
                onClick={() => setFormData(prev => ({ ...prev, waste_type: 'hazardous' }))}
                className={`flex-shrink-0 w-24 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  formData.waste_type === 'hazardous'
                    ? 'bg-blue-50 dark:bg-blue-900 border-2 border-blue-500 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-1">☣️</div>
                  <span className={`text-xs font-medium ${
                    formData.waste_type === 'hazardous' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Hazardous
                  </span>
                </div>
              </div>
            </div>
            
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Swipe to see more options
            </p>
          </div>

          {/* Severity - Horizontal Scrollable Cards */}
          <div className="mb-6">
            <label className="block text-gray-700 dark:text-gray-300 text-sm font-medium mb-2">
              Severity <span className="text-red-500">*</span>
            </label>
            
            {/* Horizontal scrollable container */}
            <div 
              className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1"
              style={{
                scrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
            >
              {/* Low Severity Card */}
              <div
                onClick={() => handleSeverityClick('Low')}
                className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  formData.severity === 'low'
                    ? 'bg-green-50 dark:bg-green-900 border-2 border-green-500 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-1">🟢</div>
                  <span className={`text-sm font-medium ${
                    formData.severity === 'low' ? 'text-green-700 dark:text-green-300' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Low
                  </span>
                  <span className={`text-xs ${
                    formData.severity === 'low' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    Minor issue
                  </span>
                </div>
              </div>

              {/* Medium Severity Card */}
              <div
                onClick={() => handleSeverityClick('Medium')}
                className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  formData.severity === 'medium'
                    ? 'bg-yellow-50 dark:bg-yellow-900 border-2 border-yellow-500 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-1">🟡</div>
                  <span className={`text-sm font-medium ${
                    formData.severity === 'medium' ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Medium
                  </span>
                  <span className={`text-xs ${
                    formData.severity === 'medium' ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    Needs attention
                  </span>
                </div>
              </div>

              {/* High Severity Card */}
              <div
                onClick={() => handleSeverityClick('High')}
                className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  formData.severity === 'high'
                    ? 'bg-red-50 dark:bg-red-900 border-2 border-red-500 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-1">🔴</div>
                  <span className={`text-sm font-medium ${
                    formData.severity === 'high' ? 'text-red-700 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    High
                  </span>
                  <span className={`text-xs ${
                    formData.severity === 'high' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    Urgent
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="block text-gray-700 dark:text-gray-300 text-sm font-medium mb-2">
              Description (optional)
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              placeholder="Describe the dumped waste and any relevant details..."
              className="w-full px-3 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Size of dumping - Horizontal Scrollable Cards */}
          <div className="mb-6">
            <label className="block text-gray-700 dark:text-gray-300 text-sm font-medium mb-2">
              Size of the illegal dumping <span className="text-red-500">*</span>
            </label>
            
            {/* Horizontal scrollable container */}
            <div 
              className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1"
              style={{
                scrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
            >
              {/* Small Size Card */}
              <div
                onClick={() => setFormData(prev => ({ ...prev, estimated_volume: 'small' }))}
                className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  formData.estimated_volume === 'small'
                    ? 'bg-blue-50 dark:bg-blue-900 border-2 border-blue-500 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-1">🛍️</div>
                  <span className={`text-sm font-medium ${
                    formData.estimated_volume === 'small' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Small
                  </span>
                  <span className={`text-xs ${
                    formData.estimated_volume === 'small' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    Few bags
                  </span>
                </div>
              </div>

              {/* Medium Size Card */}
              <div
                onClick={() => setFormData(prev => ({ ...prev, estimated_volume: 'medium' }))}
                className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  formData.estimated_volume === 'medium'
                    ? 'bg-blue-50 dark:bg-blue-900 border-2 border-blue-500 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-1">🚗</div>
                  <span className={`text-sm font-medium ${
                    formData.estimated_volume === 'medium' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Medium
                  </span>
                  <span className={`text-xs ${
                    formData.estimated_volume === 'medium' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    Car load
                  </span>
                </div>
              </div>

              {/* Large Size Card */}
              <div
                onClick={() => setFormData(prev => ({ ...prev, estimated_volume: 'large' }))}
                className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  formData.estimated_volume === 'large'
                    ? 'bg-blue-50 dark:bg-blue-900 border-2 border-blue-500 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-1">🚚</div>
                  <span className={`text-sm font-medium ${
                    formData.estimated_volume === 'large' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Large
                  </span>
                  <span className={`text-xs ${
                    formData.estimated_volume === 'large' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    Truck load
                  </span>
                </div>
              </div>

              {/* Massive Size Card */}
              <div
                onClick={() => setFormData(prev => ({ ...prev, estimated_volume: 'massive' }))}
                className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  formData.estimated_volume === 'massive'
                    ? 'bg-blue-50 dark:bg-blue-900 border-2 border-blue-500 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-1">🚛</div>
                  <span className={`text-sm font-medium ${
                    formData.estimated_volume === 'massive' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Massive
                  </span>
                  <span className={`text-xs ${
                    formData.estimated_volume === 'massive' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    Multiple trucks
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="mb-6">
            <label className="block text-gray-700 dark:text-gray-300 text-sm font-medium mb-2">
              Location <span className="text-red-500">*</span>
            </label>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Please click on the map to select a location or use the button below to detect your current location.
              </p>
            
            {/* Map */}
            <div className="mb-6">
              <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Pin Location <span className="text-red-500">*</span>
              </label>
              <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden relative">
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
                  <MapViewController position={mapPosition} />
                  <LocationMarker position={mapPosition} setPosition={setMapPosition} disabled={showCamera} />
                  {mapPosition && <Marker position={mapPosition} />}
                </MapContainer>

              </div>
            </div>
            
            {/* Location coordinates */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <div>Lat: {formData?.coordinates?.latitude?.toFixed(6) || 'N/A'}</div>
                <div>Lng: {formData?.coordinates?.longitude?.toFixed(6) || 'N/A'}</div>
              </div>
              <button
                type="button"
                onClick={() => handleUseMyLocation(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Use My Location
              </button>
            </div>
          </div>
        </div>

        {/* Take Photos */}
        <div className="mb-6">
          <label className="block text-gray-700 dark:text-gray-300 text-sm font-medium mb-2">
            Take Photos <span className="text-red-500">*</span>
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
          
          <div className="border-2 border-dashed border-gray-500 dark:border-gray-600 rounded-lg p-8">
            <div className="text-center">
              {capturedPhotos.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-green-400 mb-2">
                    ✓ {capturedPhotos.length} photo(s) captured
                  </p>
                </div>
              )}
              
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
              
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Add at least 1 photo (up to 6) to document the illegal dumping
              </p>
              <p className="text-xs text-blue-600 mt-2">
                Note: Photos can only be taken with your device's camera
              </p>
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
                className="w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 mt-0.5 mr-3"
              />
              <span className="text-gray-700 dark:text-gray-300 text-sm">
                I'm willing to be contacted for more information about this report
              </span>
            </label>
          </div>

          {/* Disclaimer */}
          <div className="mb-6 text-gray-600 dark:text-gray-400 text-sm">
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
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-4 px-6 rounded-lg transition-colors"
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
