import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../context/AuthContext.js';
import { dumpingService } from '../services/dumpingService.js';
import { toastService } from '../services/toastService.js';
import { useCallback } from 'react'; // Add useCallback for toast functions
import { notificationService } from '../services/notificationService.js';
import CameraModal from './CameraModal.js';
import PageHeader from './ui/PageHeader.js';
import { card, errorNote, primaryButton, secondaryButton, sectionTitle, tonalButton, warningNote } from './ui/styles.js';

// Choices on the form: [value, icon, label(, hint)]
const WASTE_OPTIONS = [
  ['mixed', '🗑️', 'Mixed'],
  ['construction', '🧱', 'Construction'],
  ['household', '🏠', 'Household'],
  ['electronic', '📱', 'Electronic'],
  ['organic', '🥬', 'Organic'],
  ['recyclables', '♻️', 'Recyclables'],
  ['hazardous', '☣️', 'Hazardous'],
];
const SIZE_OPTIONS = [
  ['small', '🛍️', 'Small', 'Few bags'],
  ['medium', '🚗', 'Medium', 'Car load'],
  ['large', '🚚', 'Large', 'Truck load'],
  ['massive', '🚛', 'Massive', 'Multiple trucks'],
];
// [label, icon, hint, tone]
const SEVERITY_OPTIONS = [
  ['Low', '🟢', 'Minor issue', 'green'],
  ['Medium', '🟡', 'Needs attention', 'amber'],
  ['High', '🔴', 'Urgent', 'red'],
];

const SELECTED_TONES = {
  green: 'border-td-forest bg-td-tonal dark:border-green-400 dark:bg-green-900/40',
  amber: 'border-amber-500 bg-amber-50 dark:border-amber-400 dark:bg-amber-900/30',
  red: 'border-red-600 bg-red-50 dark:border-red-400 dark:bg-red-900/30',
};

/** One choice tile: icon, label, optional hint; selected tiles get a coloured border and tint */
const OptionTile = ({ selected, onClick, icon, label, hint, tone = 'green' }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={`min-w-0 rounded-2xl border-2 px-1.5 py-2.5 flex flex-col items-center text-center transition-colors ${
      selected
        ? SELECTED_TONES[tone]
        : 'border-td-border bg-white hover:border-td-border-strong dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-400'
    }`}
  >
    <span className="text-2xl leading-none mb-1.5" aria-hidden="true">{icon}</span>
    <span className={`text-[13px] leading-tight text-td-ink dark:text-gray-100 ${selected ? 'font-bold' : 'font-semibold'}`}>{label}</span>
    {hint && <span className="text-xs leading-tight text-td-sage dark:text-gray-300 mt-0.5">{hint}</span>}
  </button>
);

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
      // Fly to the new position with smooth animation and tight focus
      map.flyTo(position, 17, {
        duration: 1.5, // Animation duration in seconds
        easeLinearity: 0.25
      });
    }
  }, [position, map]);
  
  return null;
};

// Component for handling map clicks
const LocationMarker = ({ position, setPosition, onMapClick, disabled }) => {
  const map = useMapEvents({
    click(e) {
      if (!disabled) {
        setPosition([e.latlng.lat, e.latlng.lng]);
        if (onMapClick) {
          onMapClick(e.latlng);
        }
      }
    },
  });
  return null;
};

// Labels for the option cards, reused by the submission confirmation
const WASTE_TYPE_LABELS = {
  mixed: 'Mixed waste',
  construction: 'Construction debris',
  household: 'Household waste',
  electronic: 'Electronic waste',
  organic: 'Organic waste',
  recyclables: 'Recyclables',
  hazardous: 'Hazardous waste'
};

const VOLUME_LABELS = {
  small: 'Small (few bags)',
  medium: 'Medium',
  large: 'Large',
  massive: 'Massive'
};

const DumpingReportForm = ({ onSuccess, onDone }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isLocating, setIsLocating] = useState(true); // First GPS fix is in flight on mount
  const [gpsAccuracy, setGpsAccuracy] = useState(null); // ± metres of the best fix so far
  const [gpsWatching, setGpsWatching] = useState(false); // GPS keeps improving until Submit
  // GPS keeps running (watchPosition) while the user fills in the form and takes
  // photos, keeping the most accurate fix, and stops when the report is submitted
  // or the user pins the spot on the map
  const watchIdRef = useRef(null);
  const bestAccuracyRef = useRef(Infinity);
  const [submissionSuccess, setSubmissionSuccess] = useState(null); // Summary of the submitted report

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

  // Start watching the location on mount; stop when the form goes away
  useEffect(() => {
    // Try to get current location immediately - no default
    handleUseMyLocation(false);
    return () => stopGpsWatch();
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
    // Shown on the form under the map; no pop-up on top of it
    setError(errorMessage || 'Location not available. Please click on the map to set your location.');
  }, []);

  const stopGpsWatch = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation?.clearWatch) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setGpsWatching(false);
  }, []);

  // Watch the location and keep the most accurate fix. A single
  // getCurrentPosition returned the phone's first (often coarse) fix and
  // stopped, so leaving for the camera early kept a rough point.
  const handleUseMyLocation = useCallback((showFeedback = true) => {
    // Clear any previous errors
    setError(null);
    setIsLocating(true);
    stopGpsWatch();
    bestAccuracyRef.current = Infinity;
    setGpsAccuracy(null);
    
    if (navigator.geolocation?.watchPosition) {
      try {
        if (showFeedback) {
          setLoading(true);
        }
        
        const options = {
          enableHighAccuracy: true, // REQUIRED for ≤5m accuracy
          timeout: 30000, // report a slow first fix; the watch keeps going
          maximumAge: 0 // NO cached positions - always fresh GPS
        };
        
        let gotFix = false;
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            try {
              const accuracy = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : Infinity;
              // Keep only a fix that is more accurate than the best so far
              if (gotFix && accuracy >= bestAccuracyRef.current) return;
              bestAccuracyRef.current = accuracy;

              const location = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              };
              
              setFormData(prev => ({
                ...prev,
                coordinates: location
              }));
              
              setMapPosition([location.latitude, location.longitude]);
              setGpsAccuracy(Number.isFinite(accuracy) ? Math.round(accuracy) : null);
              
              if (!gotFix) {
                gotFix = true;
                setIsLocating(false);
                setError(null);
                // The coordinates and accuracy on the form show it; no pop-up
                if (showFeedback) {
                  setLoading(false);
                }
              }
            } catch (processingError) {
              console.warn('Error processing location data:', processingError);
              if (!gotFix) {
                handleGeolocationFallback('Could not process your location data');
                setIsLocating(false);
                if (showFeedback) {
                  setLoading(false);
                }
              }
            }
          },
          (error) => {
            console.warn('Geolocation error:', error);
            // After a fix, a slow update is not a problem: keep the best fix and keep watching
            if (gotFix && error.code !== error.PERMISSION_DENIED) return;
            if (error.code === error.PERMISSION_DENIED) stopGpsWatch();
            handleGeolocationFallback(`${getGeolocationErrorMessage(error)}`);
            setIsLocating(false);
            if (showFeedback) {
              setLoading(false);
            }
          },
          options
        );
        setGpsWatching(true);
      } catch (exception) {
        console.warn('Geolocation exception:', exception);
        stopGpsWatch();
        handleGeolocationFallback('Unexpected error accessing location services');
        setIsLocating(false);
        if (showFeedback) {
          setLoading(false);
        }
      }
    } else {
      handleGeolocationFallback('Geolocation is not supported by your browser');
      setIsLocating(false);
      if (showFeedback) {
        setLoading(false);
      }
    }
  }, [handleGeolocationFallback, getGeolocationErrorMessage, setError, stopGpsWatch]);

  const handleMapClick = (latlng) => {
    // Clear any location errors when user manually selects location
    if (error && error.includes('location')) {
      setError(null);
    }
    
    // The spot the user pinned wins over GPS
    stopGpsWatch();
    setGpsAccuracy(null);
    setMapPosition([latlng.lat, latlng.lng]);
    setIsLocating(false);
    setFormData(prev => ({
      ...prev,
      coordinates: {
        latitude: latlng.lat,
        longitude: latlng.lng
      }
    }));
    // The pin and coordinates show the chosen spot; no pop-up
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
            
            // The camera flashes the count (1/6, 2/6 …); no pop-up
            console.log(`Photo captured successfully. Total photos: ${updated.length}`);
            
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

  // Everything the report needs, so a disabled Submit button is never a dead end
  const missingRequirements = [];
  if (!formData.coordinates) {
    missingRequirements.push('A location - tap the map or use "Use My Location"');
  }
  if (!formData.waste_type) {
    missingRequirements.push('The type of waste');
  }
  if (!formData.estimated_volume) {
    missingRequirements.push('The size of the illegal dumping');
  }
  if (formData.photos.length === 0) {
    missingRequirements.push('At least one photo taken with your camera');
  }
  const canSubmit = missingRequirements.length === 0 && !loading;

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

    // GPS stops here: the report uses the most accurate fix collected so far
    stopGpsWatch();
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

      // Snapshot what was reported before the form is cleared
      const confirmation = {
        reference: String(data.id).slice(0, 8).toUpperCase(),
        wasteType: WASTE_TYPE_LABELS[formData.waste_type] || formData.waste_type,
        volume: VOLUME_LABELS[formData.estimated_volume] || formData.estimated_volume,
        severity: formData.severity,
        photoCount: formData.photos.length,
        coordinates: formData.coordinates,
        hazardous: formData.hazardous_materials
      };

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
      setCapturedPhotos([]);
      // Locate afresh for a next report
      handleUseMyLocation(false);

      // Confirm on screen - a toast alone disappears before it is read
      setSubmissionSuccess(confirmation);
      showSuccessToast('Report submitted successfully');
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (scrollError) {
        // Non-fatal - some environments do not implement smooth scrolling
      }

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

  const spinner = (cls) => (
    <svg className={`animate-spin ${cls}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );

  return (
    <div className="max-w-3xl mx-auto px-2 pb-24 space-y-5">
      <PageHeader
        title="Report Illegal Dumping"
        subtitle="Help keep our community clean. Your report goes to the local authorities for cleanup."
      />

      {/* Submission confirmation */}
      {submissionSuccess && (
        <section className={`${card} px-4 py-4`} role="status" aria-live="polite">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300 flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[17px] font-bold text-td-ink dark:text-gray-100">
                Report submitted - reference {submissionSuccess.reference}
              </p>
              <p className="text-sm text-td-sage dark:text-gray-300 mt-1">
                {submissionSuccess.wasteType}, {submissionSuccess.volume}, {submissionSuccess.severity} severity,
                {' '}{submissionSuccess.photoCount} photo{submissionSuccess.photoCount === 1 ? '' : 's'}
                {submissionSuccess.hazardous ? ' · flagged hazardous' : ''}
                {submissionSuccess.coordinates
                  ? ` at ${submissionSuccess.coordinates.latitude.toFixed(5)}, ${submissionSuccess.coordinates.longitude.toFixed(5)}`
                  : ''}.
              </p>
              <p className="text-sm text-td-sage dark:text-gray-300 mt-1">
                Local authorities have been notified. You can follow it up under Activity.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2.5 mt-4">
            {onDone && (
              <button type="button" onClick={() => onDone(submissionSuccess)} className={primaryButton}>
                Back to Dashboard
              </button>
            )}
            <button type="button" onClick={() => setSubmissionSuccess(null)} className={secondaryButton}>
              Report another site
            </button>
          </div>
        </section>
      )}

      <form onSubmit={handleSubmit} autoComplete="off" noValidate className="space-y-5">
        {/* What was dumped: type, size and severity */}
        <section className={`${card} px-4 py-4 space-y-5`}>
          <div role="group" aria-labelledby="report-waste-type">
            <p id="report-waste-type" className={`${sectionTitle} mb-2.5`}>
              Type of Waste <span className="text-td-error" aria-hidden="true">*</span>
            </p>
            <div className="grid grid-cols-3 min-[480px]:grid-cols-4 gap-2">
              {WASTE_OPTIONS.map(([value, icon, label]) => (
                <OptionTile
                  key={value}
                  selected={formData.waste_type === value}
                  onClick={() => setFormData(prev => ({ ...prev, waste_type: value }))}
                  icon={icon}
                  label={label}
                />
              ))}
            </div>
          </div>

          <div role="group" aria-labelledby="report-size">
            <p id="report-size" className={`${sectionTitle} mb-2.5`}>
              Size of the illegal dumping <span className="text-td-error" aria-hidden="true">*</span>
            </p>
            <div className="grid grid-cols-2 min-[480px]:grid-cols-4 gap-2">
              {SIZE_OPTIONS.map(([value, icon, label, hint]) => (
                <OptionTile
                  key={value}
                  selected={formData.estimated_volume === value}
                  onClick={() => setFormData(prev => ({ ...prev, estimated_volume: value }))}
                  icon={icon}
                  label={label}
                  hint={hint}
                />
              ))}
            </div>
          </div>

          <div role="group" aria-labelledby="report-severity">
            <p id="report-severity" className={`${sectionTitle} mb-2.5`}>
              Severity <span className="text-td-error" aria-hidden="true">*</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {SEVERITY_OPTIONS.map(([label, icon, hint, tone]) => (
                <OptionTile
                  key={label}
                  selected={formData.severity === label.toLowerCase()}
                  onClick={() => handleSeverityClick(label)}
                  icon={icon}
                  label={label}
                  hint={hint}
                  tone={tone}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Location */}
        <section className={`${card} px-4 py-4`} aria-labelledby="report-location">
          <p id="report-location" className={sectionTitle}>
            Location <span className="text-td-error" aria-hidden="true">*</span>
          </p>
          <p className="text-sm text-td-sage dark:text-gray-300 mt-1 mb-3">
            Please click on the map to select a location or use the button below to detect your current location.
          </p>
          <div className="h-44 bg-gray-100 dark:bg-gray-700 rounded-2xl overflow-hidden relative">
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
              <LocationMarker position={mapPosition} setPosition={setMapPosition} onMapClick={handleMapClick} disabled={showCamera} />
              {mapPosition && <Marker position={mapPosition} />}
            </MapContainer>
          </div>

          <div className="flex items-center justify-between gap-3 mt-3">
            <div className="text-sm text-td-sage dark:text-gray-300 min-w-0" role="status" aria-live="polite">
              {isLocating && !formData?.coordinates ? (
                <div className="flex items-center animate-pulse">
                  {spinner('mr-2 h-4 w-4 text-td-forest')}
                  Detecting your location...
                </div>
              ) : formData?.coordinates ? (
                <>
                  <div>Lat: {formData.coordinates.latitude?.toFixed(6)}</div>
                  <div>Lng: {formData.coordinates.longitude?.toFixed(6)}</div>
                  {gpsAccuracy !== null && (
                    <div className={gpsAccuracy <= 10 ? 'text-td-forest dark:text-green-300' : 'text-amber-800 dark:text-amber-300'}>
                      GPS ±{gpsAccuracy} m{gpsWatching ? ' · improving until you submit' : ''}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-amber-800 dark:text-amber-300">
                  No location set yet - tap the map or use the button.
                </div>
              )}
            </div>
            <button type="button" onClick={() => handleUseMyLocation(true)} className={`${tonalButton} flex-shrink-0 h-10`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
              Use My Location
            </button>
          </div>
        </section>

        {/* Take Photos */}
        <section className={`${card} px-4 py-4`} aria-labelledby="report-photos">
          <p id="report-photos" className={sectionTitle}>
            Take Photos <span className="text-td-error" aria-hidden="true">*</span>
          </p>
          <p className="text-sm text-td-sage dark:text-gray-300 mt-1">
            Add at least 1 photo (up to 6) to document the illegal dumping
          </p>

          {capturedPhotos.length > 0 && (
            <>
              <p className="text-sm font-semibold text-td-forest dark:text-green-300 mt-3">
                ✓ {capturedPhotos.length} photo(s) captured
              </p>
              <div className="grid grid-cols-2 min-[480px]:grid-cols-3 gap-2 mt-2">
                {capturedPhotos.map((photo, i) => (
                  <div key={photo.id} className="relative">
                    <img
                      src={photo.url}
                      alt={`Illegal dumping, shot ${i + 1}`}
                      className="w-full h-32 object-cover rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      aria-label={`Remove photo ${i + 1}`}
                      className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full w-7 h-7 flex items-center justify-center text-base leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <button type="button" onClick={handleTakePhoto} className={`${primaryButton} w-full mt-4`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            Take Photo with Camera
          </button>
          <p className="text-xs text-td-sage dark:text-gray-300 mt-2 text-center">
            Note: Photos can only be taken with your device's camera
          </p>
        </section>

        {/* Camera Modal */}
        {showCamera && (
          <CameraModal
            onClose={handleCloseCamera}
            onCapture={handleCapturePhoto}
            maxPhotos={6}
            currentCount={capturedPhotos.length}
          />
        )}

        {/* More details (optional): description and contact consent */}
        <div role="group" aria-labelledby="report-more-details" className={`${card} px-4 py-4`}>
          <p id="report-more-details" className={`${sectionTitle} mb-2`}>More details (optional)</p>
          <label htmlFor="report-description" className="block text-td-sage dark:text-gray-300 text-sm mb-1">
            Description (optional)
          </label>
          <textarea
            id="report-description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={2}
            placeholder="Describe the dumped waste and any relevant details..."
            className="w-full px-3.5 py-2.5 mb-3 bg-white dark:bg-gray-700 border border-td-border-strong dark:border-gray-500 rounded-xl text-[15px] text-td-ink dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:border-td-forest focus:ring-2 focus:ring-td-forest/30 resize-none"
          />
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="contact_consent"
              checked={formData.contact_consent}
              onChange={handleChange}
              className="w-5 h-5 text-td-forest bg-white dark:bg-gray-700 border-td-border-strong dark:border-gray-500 rounded focus:ring-td-forest mt-0.5"
            />
            <span className="text-td-ink dark:text-gray-200 text-[15px]">
              I'm willing to be contacted for more information about this report
            </span>
          </label>
        </div>

        {/* Disclaimer */}
        <div className="px-1 text-td-sage dark:text-gray-300 text-sm space-y-2">
          <p>
            By submitting this report, you confirm that the information provided is accurate to the best of your knowledge.
          </p>
          <p>
            <strong className="text-td-ink dark:text-gray-100">Note:</strong> Photos can only be taken with your device's camera and cannot be selected from your gallery.
          </p>
        </div>

        {/* Reasons the Submit button is disabled */}
        {missingRequirements.length > 0 && (
          <div id="report-missing-requirements" className={`${warningNote} px-4 py-3`} role="status">
            <p className="text-sm font-semibold">
              Add the following before you can submit:
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1">
              {missingRequirements.map(requirement => (
                <li key={requirement} className="text-sm">{requirement}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!canSubmit}
          aria-describedby={missingRequirements.length > 0 ? 'report-missing-requirements' : undefined}
          title={missingRequirements.length > 0 ? `Still needed: ${missingRequirements.join('; ')}` : undefined}
          className={`${primaryButton} w-full h-[52px]`}
        >
          {loading ? (
            <span className="flex items-center justify-center">
              {spinner('-ml-1 mr-3 h-5 w-5 text-white')}
              Submitting...
            </span>
          ) : (
            'Submit Report'
          )}
        </button>
      </form>

      {error && (
        <div role="alert" className={`${errorNote} px-4 py-3 flex items-center gap-2`}>
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
};

export default DumpingReportForm;
