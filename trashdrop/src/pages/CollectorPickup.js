import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { processQRCode, updatePickupStatus, completePickup } from '../utils/qrScanner';
import PaymentAndRating from '../components/collection/PaymentAndRating';
import { collectorService } from '../services/collectorService';
import GeolocationService from '../utils/geolocationService';
import { 
  FaQrcode, 
  FaCheckCircle, 
  FaTimesCircle, 
  FaSpinner, 
  FaArrowLeft, 
  FaCheck, 
  FaTimes, 
  FaCamera, 
  FaTrash, 
  FaInfoCircle,
  FaWeightHanging,
  FaRulerVertical,
  FaTag,
  FaImage,
  FaPlus,
  FaMinus,
  FaShare,
  FaDownload,
  FaExpand
} from 'react-icons/fa';
import { QRCodeSVG } from 'qrcode.react';
import { saveAs } from 'file-saver';

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error in CollectorPickup:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white p-6 rounded-lg shadow-md text-center">
            <FaTimesCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-medium text-red-800">Something went wrong</h3>
            <p className="mt-2 text-sm text-red-700">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-100 text-red-800 rounded-md hover:bg-red-200"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const CollectorPickup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scanResult, setScanResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPickup, setCurrentPickup] = useState(null);
  const [status, setStatus] = useState('ready'); // ready, scanning, processing, success, error
  // Split form state into smaller, more focused states to prevent unnecessary re-renders
  const [bagCount, setBagCount] = useState(1);
  const [wasteType, setWasteType] = useState('');
  const [weight, setWeight] = useState('');
  const [volume, setVolume] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [specialHandling, setSpecialHandling] = useState(false);
  const [contamination, setContamination] = useState(false);
  const [contaminationNotes, setContaminationNotes] = useState('');
  
  // Memoize the form data to prevent unnecessary re-renders
  const formData = useMemo(() => ({
    bagCount,
    wasteType,
    weight,
    volume,
    notes,
    tags,
    photos,
    specialHandling,
    contamination,
    contaminationNotes
  }), [
    bagCount, 
    wasteType, 
    weight, 
    volume, 
    notes, 
    tags, 
    photos, 
    specialHandling, 
    contamination, 
    contaminationNotes
  ]);
  
  // Memoized input handler for form fields
  const handleInputChange = useCallback((field, value) => {
    try {
      switch (field) {
        case 'bagCount':
          setBagCount(Number(value) || 0);
          break;
        case 'wasteType':
          setWasteType(value);
          break;
        case 'weight':
          setWeight(Number(value) || 0);
          break;
        case 'volume':
          setVolume(Number(value) || 0);
          break;
        case 'notes':
          setNotes(value);
          break;
        case 'specialHandling':
          setSpecialHandling(value);
          break;
        case 'contamination':
          setContamination(value);
          break;
        case 'contaminationNotes':
          setContaminationNotes(value);
          break;
        default:
          console.warn(`Unknown field: ${field}`);
      }
    } catch (err) {
      console.error('Error in handleInputChange:', err);
      setError('Failed to update form. Please try again.');
    }
  }, []);
  
  // Toggle boolean form fields
  const toggleBooleanField = useCallback((field) => {
    try {
      switch (field) {
        case 'specialHandling':
          setSpecialHandling(prev => !prev);
          break;
        case 'contamination':
          setContamination(prev => !prev);
          break;
        default:
          console.warn(`Unknown boolean field: ${field}`);
      }
    } catch (err) {
      console.error('Error in toggleBooleanField:', err);
      setError('Failed to update form. Please try again.');
    }
  }, []);
  
  // Payment and rating state
  const [showPayment, setShowPayment] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [pickupComplete, setPickupComplete] = useState(false);
  
  // QR Code modal state
  const [showQRCodeModal, setShowQRCodeModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState('');
  
  // Camera and scanner state
  const [showCamera, setShowCamera] = useState(false);
  const [qrReader, setQrReader] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [manualQRInput, setManualQRInput] = useState('');
  
  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  const [activeTab, setActiveTab] = useState('details'); // 'details' or 'photos' or 'review'
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Available waste types
  const wasteTypes = [
    'General Waste',
    'Recyclables',
    'Organic',
    'Hazardous',
    'E-waste',
    'Construction Debris',
    'Medical',
    'Other'
  ];
  
  // Available tags
  const availableTags = [
    'Heavy',
    'Fragile',
    'Odorous',
    'Wet',
    'Sharp',
    'Bulky',
    'Contaminated'
  ];

  // Initialize QR code scanner
  useEffect(() => {
    // In a real app, you would initialize the camera and QR scanner here
    // For this example, we'll simulate the scanner with a file input
    return () => {
      // Cleanup camera and scanner when component unmounts
      if (qrReader) {
        qrReader.stop();
      }
    };
  }, []);

  // Track collector location and update profile every 30 seconds
  const locationIntervalRef = useRef(null);
  useEffect(() => {
    const updateCollectorLocation = async () => {
      if (!user?.id) return;
      
      try {
        const locationResult = await GeolocationService.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000
        });
        
        if (locationResult.success && locationResult.coords?.latitude && locationResult.coords?.longitude) {
          console.log('[CollectorPickup] Updating collector location:', locationResult.coords);
          await collectorService.updateCollectorLocation(user.id, {
            latitude: locationResult.coords.latitude,
            longitude: locationResult.coords.longitude
          });
        }
      } catch (err) {
        console.error('[CollectorPickup] Error updating location:', err);
      }
    };

    // Update location immediately and every 30 seconds
    updateCollectorLocation();
    locationIntervalRef.current = setInterval(updateCollectorLocation, 30000);

    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
    };
  }, [user?.id]);

  // Handle QR code scanning
  const handleScan = async (qrData) => {
    if (!qrData || status === 'processing') return;
    
    setStatus('processing');
    setError('');
    setIsLoading(true);
    
    try {
      const result = await processQRCode(qrData, {
        id: user.id,
        name: user.user_metadata?.full_name || 'Collector',
        phone: user.phone
      });
      
      if (result.success) {
        setCurrentPickup(result.pickup);
        setStatus('scanned');
        setBagCount(result.pickup.bag_count || 1);
      } else {
        setError(result.error || 'Failed to process QR code');
        setStatus('error');
      }
    } catch (err) {
      console.error('Error processing QR code:', err);
      setError(err.message || 'An unexpected error occurred');
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle manual QR code input
  const handleManualInputChange = (e) => {
    setManualQRInput(e.target.value);
  };

  const handleManualInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      const value = manualQRInput.trim();
      if (value) {
        handleScan(value);
      }
    }
  };

  // Handle manual QR code input
  
  // Memoize tag toggle handler
  const toggleTag = useCallback((tag) => {
    setTags(prevTags => 
      prevTags.includes(tag)
        ? prevTags.filter(t => t !== tag)
        : [...prevTags, tag]
    );
  }, []);
  
  // Memoize photo capture handler
  const handleCapturePhoto = useCallback(() => {
    // In a real app, this would open the device camera
    // For demo purposes, we'll simulate a photo capture
    const newPhoto = {
      id: Date.now(),
      // Use a smaller image size for mobile devices
      uri: `https://picsum.photos/seed/${Date.now()}/800/600`,
      thumbnail: `https://picsum.photos/seed/${Date.now()}/200/150`,
      timestamp: new Date().toISOString(),
      notes: ''
    };
    
    setPhotos(prev => [...prev, newPhoto]);
  }, []);
  
  // Memoize photo removal handler
  const handleRemovePhoto = useCallback((photoId) => {
    setPhotos(prev => prev.filter(photo => photo.id !== photoId));
  }, []);
  
  // Memoize photo notes update handler
  const updatePhotoNotes = useCallback((photoId, notes) => {
    setPhotos(prev => 
      prev.map(photo => 
        photo.id === photoId ? { ...photo, notes } : photo
      )
    );
  }, []);
  
  // Complete the pickup process
  const handleCompletePickup = async () => {
    if (!currentPickup) return;
    
    setIsLoading(true);
    setError('');
    
    try {
      // In a real app, you would upload photos to storage here
      // and get the URLs to store in the database
      const photoUrls = formData.photos.map(photo => ({
        url: photo.uri,
        notes: photo.notes,
        timestamp: photo.timestamp
      }));
      
      // First, update the pickup status to 'pending_payment'
      const result = await updatePickupStatus(
        currentPickup.id,
        'pending_payment',
        {
          id: user.id,
          name: user.user_metadata?.full_name || 'Collector',
          phone: user.phone
        },
        {
          actual_bag_count: formData.bagCount,
          waste_type: formData.wasteType || currentPickup.waste_type,
          weight_kg: parseFloat(formData.weight) || null,
          volume_liters: parseFloat(formData.volume) || null,
          notes: formData.notes.trim() || null,
          tags: formData.tags,
          photos: photoUrls,
          special_handling: formData.specialHandling,
          contamination: formData.contamination,
          contamination_notes: formData.contamination ? formData.contaminationNotes : null,
          collected_at: new Date().toISOString()
        }
      );
      
      if (result.success) {
        setCurrentPickup(result.pickup);
        setShowPayment(true);
      } else {
        throw new Error(result.error || 'Failed to complete pickup');
      }
    } catch (err) {
      console.error('Error completing pickup:', err);
      setError(err.message || 'Failed to complete pickup');
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle payment and rating completion
  const handlePaymentAndRatingComplete = async (data) => {
    setIsLoading(true);
    setError('');
    
    try {
      // Update the pickup with payment and rating info
      const { error } = await supabase
        .from('scheduled_pickups')
        .update({
          status: 'completed',
          payment_method: data.payment.method,
          payment_amount: data.payment.total,
          payment_status: data.payment.status,
          collector_rating: data.rating,
          collector_review: data.review,
          completed_at: new Date().toISOString()
        })
        .eq('id', currentPickup.id);
      
      if (error) throw error;
      
      setPaymentComplete(true);
      setPickupComplete(true);
      setStatus('completed');
    } catch (err) {
      console.error('Error updating pickup with payment info:', err);
      setError('Failed to complete payment. Please contact support.');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset the scanner
  const resetScanner = () => {
    setCurrentPickup(null);
    setScanResult(null);
    setError('');
    setStatus('ready');
    setBagCount(1);
    setNotes('');
  };
  
  // Show QR code for the current pickup
  const showQRCode = () => {
    if (!currentPickup) return;
    
    // Generate a unique string for this pickup that can be verified offline
    const pickupData = {
      id: currentPickup.id,
      userId: currentPickup.user_id,
      locationId: currentPickup.location_id,
      timestamp: new Date().toISOString(),
      // Add a simple checksum for offline validation
      checksum: `td-${currentPickup.id.substring(0, 4)}-${Date.now().toString(36)}`
    };
    
    const qrData = JSON.stringify(pickupData);
    setQrCodeData(qrData);
    setShowQRCodeModal(true);
  };
  
  // Download QR code as PNG
  const downloadQRCode = () => {
    if (!qrCodeData) return;
    
    // Create a canvas to render the QR code
    const canvas = document.createElement('canvas');
    const qrCode = document.getElementById('qr-code-svg');
    
    if (!qrCode) return;
    
    // Set canvas dimensions
    const size = 512;
    canvas.width = size;
    canvas.height = size;
    
    // Get the SVG data
    const svgData = new XMLSerializer().serializeToString(qrCode);
    const img = new Image();
    
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      
      // Convert to blob and download
      canvas.toBlob((blob) => {
        saveAs(blob, `trashdrop-pickup-${currentPickup?.id.substring(0, 8)}.png`);
      }, 'image/png');
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };
  
  // Share QR code using Web Share API
  const shareQRCode = async () => {
    if (!navigator.share) {
      // Fallback for browsers that don't support Web Share API
      downloadQRCode();
      return;
    }
    
    try {
      // Create a temporary canvas to generate the image
      const canvas = document.createElement('canvas');
      const qrCode = document.getElementById('qr-code-svg');
      
      if (!qrCode) return;
      
      const size = 1024;
      canvas.width = size;
      canvas.height = size;
      
      const svgData = new XMLSerializer().serializeToString(qrCode);
      const img = new Image();
      
      await new Promise((resolve) => {
        img.onload = () => {
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(img, 0, 0, size, size);
          resolve();
        };
        
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
      });
      
      // Convert canvas to blob for sharing
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      
      // Create a file for sharing
      const file = new File([blob], `trashdrop-pickup-${currentPickup?.id.substring(0, 8)}.png`, {
        type: 'image/png',
      });
      
      // Share the file
      await navigator.share({
        title: `TrashDrop Pickup #${currentPickup?.id.substring(0, 8)}`,
        text: `Here's the QR code for TrashDrop pickup #${currentPickup?.id.substring(0, 8)}`,
        files: [file],
      });
    } catch (err) {
      console.error('Error sharing QR code:', err);
      // Fallback to download if sharing fails
      downloadQRCode();
    }
  };

  // Focus management for accessibility
  useEffect(() => {
    // Focus the main heading when the component mounts or status changes
    const mainHeading = document.querySelector('h1');
    if (mainHeading) {
      mainHeading.setAttribute('tabIndex', '-1');
      mainHeading.focus();
    }
  }, [status]);

  // Render the scanner interface
  const renderScanner = () => {
    if (showCamera) {
      // In a real app, this would show the camera view
      return (
        <div className="bg-black w-full h-64 flex items-center justify-center relative">
          <div className="border-2 border-white border-dashed w-64 h-64 relative">
            <div className="absolute inset-0 border-4 border-primary opacity-50"></div>
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
              <FaQrcode className="text-white text-6xl opacity-30" />
            </div>
          </div>
          <div className="absolute bottom-4 left-0 right-0 text-center text-white text-sm">
            Point your camera at a TrashDrop QR code
          </div>
          <button 
            onClick={() => setShowCamera(false)}
            className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full"
          >
            <FaTimes />
          </button>
        </div>
      );
    }

    return (
      <div className="bg-gray-100 p-6 rounded-xl text-center">
        <div className="mx-auto w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <FaQrcode className="text-primary text-4xl" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Scan Pickup QR Code</h3>
        <p className="text-gray-600 mb-6">
          Scan the QR code provided by the customer to start the pickup process.
        </p>
        <button
          onClick={() => setShowCamera(true)}
          className="w-full bg-primary text-white py-3 px-6 rounded-lg font-medium hover:bg-primary-dark transition-colors flex items-center justify-center space-x-2"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <FaSpinner className="animate-spin" />
              <span>Scanning...</span>
            </>
          ) : (
            <>
              <FaQrcode />
              <span>Scan QR Code</span>
            </>
          )}
        </button>
        
        <div className="mt-4 relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">or</span>
          </div>
        </div>
        
        <div className="mt-4">
          <label htmlFor="manual-qr" className="block text-sm font-medium text-gray-700 mb-1">
            Enter QR Code Manually
          </label>
          <input
            type="text"
            id="manual-qr"
            value={manualQRInput}
            onChange={handleManualInputChange}
            onKeyDown={handleManualInputKeyDown}
            placeholder="Enter QR Code..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary text-black"
            disabled={isLoading}
          />
        </div>
      </div>
    );
  };

  // Tab content component to improve readability
  const TabContent = ({ children, active, tabName }) => {
    return (
      <div className={active === tabName ? 'block' : 'hidden'}>
        {children}
      </div>
    );
  };

  // Memoize the pickup details component to prevent unnecessary re-renders
  const PickupDetails = memo(({ currentPickup, formData, onInputChange, onToggleTag, onCapturePhoto, onRemovePhoto, onUpdatePhotoNotes, activeTab, setActiveTab, status, showPayment, pickupComplete, onCompletePickup }) => {
    if (!currentPickup) return null;
    
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Pickup Details</h2>
              <p className="text-sm text-gray-500">#{currentPickup.id.substring(0, 8)}</p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {currentPickup.status === 'in_progress' ? 'In Progress' : 
               currentPickup.status === 'completed' ? 'Completed' : 'Scheduled'}
            </span>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Location</h3>
            <p className="mt-1 text-gray-900">{currentPickup.location_name || 'Unknown Location'}</p>
            <p className="text-sm text-gray-500">{currentPickup.address || 'No address provided'}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Scheduled</h3>
              <p className="mt-1 text-gray-900">
                {new Date(currentPickup.pickup_date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Waste Type</h3>
              <p className="mt-1 text-gray-900 capitalize">
                {currentPickup.waste_type?.toLowerCase() || 'general waste'}
              </p>
            </div>
          </div>
          
          {currentPickup.special_instructions && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">Special Instructions</h3>
              <p className="mt-1 text-gray-900 whitespace-pre-line">
                {currentPickup.special_instructions}
              </p>
            </div>
          )}
          
          {status === 'scanned' && (
            <div className="pt-4 mt-4 border-t border-gray-100">
              {/* Tabs */}
              <div className="flex border-b border-gray-200 mb-4">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`px-4 py-2 text-sm font-medium ${activeTab === 'details' ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Details
                </button>
                <button
                  onClick={() => setActiveTab('photos')}
                  className={`px-4 py-2 text-sm font-medium ${activeTab === 'photos' ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Photos ({formData.photos.length})
                </button>
                <button
                  onClick={() => setActiveTab('review')}
                  className={`px-4 py-2 text-sm font-medium ${activeTab === 'review' ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Review
                </button>
              </div>
              
              {/* Details Tab */}
              <TabContent active={activeTab} tabName="details">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="waste-type" className="block text-sm font-medium text-gray-700 mb-1">
                      Waste Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="waste-type"
                      value={formData.wasteType || currentPickup.waste_type || ''}
                      onChange={(e) => handleInputChange('wasteType', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary"
                      required
                    >
                      <option value="">Select waste type</option>
                      {wasteTypes.map(type => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="bag-count" className="block text-sm font-medium text-gray-700 mb-1">
                        Bags <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => handleInputChange('bagCount', Math.max(1, formData.bagCount - 1))}
                          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700"
                          disabled={formData.bagCount <= 1}
                        >
                          <FaMinus size={12} />
                        </button>
                        <input
                          type="number"
                          id="bag-count"
                          min="1"
                          max="100"
                          value={formData.bagCount}
                          onChange={(e) => handleInputChange('bagCount', parseInt(e.target.value) || 1)}
                          className="w-full px-4 py-2 text-center border-0 focus:ring-0 text-black"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => handleInputChange('bagCount', formData.bagCount + 1)}
                          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700"
                        >
                          <FaPlus size={12} />
                        </button>
                      </div>
                    </div>
                    
                    <div>
                      <label htmlFor="weight" className="block text-sm font-medium text-gray-700 mb-1">
                        Weight (kg)
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <FaWeightHanging className="text-gray-400" />
                        </div>
                        <input
                          type="number"
                          id="weight"
                          step="0.1"
                          min="0"
                          value={formData.weight}
                          onChange={(e) => handleInputChange('weight', e.target.value)}
                          className="w-full pl-10 px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary text-black"
                          placeholder="0.0"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label htmlFor="volume" className="block text-sm font-medium text-gray-700 mb-1">
                        Volume (L)
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <FaRulerVertical className="text-gray-400" />
                        </div>
                        <input
                          type="number"
                          id="volume"
                          step="0.1"
                          min="0"
                          value={formData.volume}
                          onChange={(e) => handleInputChange('volume', e.target.value)}
                          className="w-full pl-10 px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary text-black"
                          placeholder="0.0"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tags
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableTags.map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => onToggleTag(tag)}
                          className={`px-3 py-1 text-xs rounded-full flex items-center ${formData.tags.includes(tag) 
                            ? 'bg-primary text-white' 
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                        >
                          <FaTag className="mr-1" size={10} />
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="special-handling"
                        checked={formData.specialHandling}
                        onChange={(e) => handleInputChange('specialHandling', e.target.checked)}
                        className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded text-black"
                      />
                      <label htmlFor="special-handling" className="ml-2 block text-sm text-gray-700">
                        Requires special handling
                      </label>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="flex items-center h-5">
                        <input
                          type="checkbox"
                          id="contamination"
                          checked={formData.contamination}
                          onChange={(e) => handleInputChange('contamination', e.target.checked)}
                          className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded text-black"
                        />
                      </div>
                      <label htmlFor="contamination" className="ml-2 block text-sm text-gray-700">
                        Contamination detected
                      </label>
                    </div>
                    
                    {formData.contamination && (
                      <div className="ml-6 mt-2">
                        <label htmlFor="contamination-notes" className="block text-sm font-medium text-gray-700 mb-1">
                          Contamination details
                        </label>
                        <textarea
                          id="contamination-notes"
                          rows="2"
                          value={formData.contaminationNotes}
                          onChange={(e) => handleInputChange('contaminationNotes', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary text-black"
                          placeholder="Describe the contamination..."
                        ></textarea>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      id="notes"
                      rows="3"
                      value={formData.notes}
                      onChange={(e) => handleInputChange('notes', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary text-black"
                      placeholder="Any additional notes about this pickup..."
                    ></textarea>
                  </div>
                  
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('photos')}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                    >
                      Next: Add Photos
                    </button>
                  </div>
                </div>
              </TabContent>
              
              {/* Photos Tab */}
              <TabContent active={activeTab} tabName="photos">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Photo capture button */}
                    <button
                      type="button"
                      onClick={handleCapturePhoto}
                      className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-gray-500 hover:border-gray-400"
                    >
                      <FaCamera className="text-2xl mb-2" />
                      <span className="text-sm">Take Photo</span>
                    </button>
                    
                    {/* Photo previews */}
                    {formData.photos.map(photo => (
                      <div key={photo.id} className="relative group">
                        <img 
                          src={photo.uri} 
                          alt={`Pickup ${photo.id}`} 
                          className="w-full h-full object-cover rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(photo.id)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <FaTimes size={12} />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white p-2 text-xs">
                          <input
                            type="text"
                            value={photo.notes}
                            onChange={(e) => updatePhotoNotes(photo.id, e.target.value)}
                            placeholder="Add notes..."
                            className="w-full bg-white border-0 border-b border-gray-300 focus:ring-0 focus:border-primary text-black placeholder-gray-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex justify-between pt-4">
                    <button
                      type="button"
                      onClick={() => setActiveTab('details')}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                    >
                      Back to Details
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('review')}
                      disabled={formData.photos.length === 0}
                      className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${formData.photos.length > 0 ? 'bg-primary hover:bg-primary-dark' : 'bg-gray-300 cursor-not-allowed'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary`}
                    >
                      Review and Submit
                    </button>
                  </div>
                </div>
              </TabContent>
              
              {/* Review Tab */}
              <TabContent active={activeTab} tabName="review">
                {!showPayment ? (
                <div className="space-y-6">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="text-sm font-medium text-blue-800 flex items-center">
                      <FaInfoCircle className="mr-2 flex-shrink-0" />
                      Review the information before submitting
                    </h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">Waste Details</h4>
                      <div className="mt-1 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Type</p>
                          <p className="text-sm font-medium text-gray-900">{formData.wasteType || currentPickup.waste_type || 'Not specified'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Bags</p>
                          <p className="text-sm font-medium text-gray-900">{formData.bagCount}</p>
                        </div>
                        {formData.weight && (
                          <div>
                            <p className="text-sm text-gray-500">Weight</p>
                            <p className="text-sm font-medium text-gray-900">{formData.weight} kg</p>
                          </div>
                        )}
                        {formData.volume && (
                          <div>
                            <p className="text-sm text-gray-500">Volume</p>
                            <p className="text-sm font-medium text-gray-900">{formData.volume} L</p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {formData.tags.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Tags</h4>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {formData.tags.map(tag => (
                            <span key={tag} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {(formData.specialHandling || formData.contamination) && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Special Notes</h4>
                        <ul className="mt-1 text-sm text-gray-700 space-y-1">
                          {formData.specialHandling && <li>• Requires special handling</li>}
                          {formData.contamination && (
                            <>
                              <li>• Contamination detected</li>
                              {formData.contaminationNotes && (
                                <li className="pl-4 text-gray-600">- {formData.contaminationNotes}</li>
                              )}
                            </>
                          )}
                        </ul>
                      </div>
                    )}
                    
                    {formData.notes && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Collector Notes</h4>
                        <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{formData.notes}</p>
                      </div>
                    )}
                    
                    {formData.photos.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Photos ({formData.photos.length})</h4>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          {formData.photos.map(photo => (
                            <div key={photo.id} className="relative aspect-square">
                              <img 
                                src={photo.uri} 
                                alt={`Pickup ${photo.id}`} 
                                className="w-full h-full object-cover rounded"
                              />
                              {photo.notes && (
                                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 truncate">
                                  {photo.notes}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex justify-between pt-4">
                    <button
                      type="button"
                      onClick={() => setActiveTab('photos')}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                    >
                      Back to Photos
                    </button>
                    <div className="space-x-3">
                      <button
                        type="button"
                        onClick={resetScanner}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                        disabled={isLoading}
                      >
                        <FaTimesCircle className="mr-2" />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleCompletePickup}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <FaSpinner className="animate-spin mr-2" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <FaCheckCircle className="mr-2" />
                            Complete Pickup
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                ) : null}
              </TabContent>
            </div>
          )}
          
          {status === 'scanned' && (
            <div className="mt-6">
              {showPayment && !pickupComplete ? (
                <PaymentAndRating
                  pickup={currentPickup}
                  collector={{
                    id: user.id,
                    name: user.user_metadata?.full_name || 'Collector'
                  }}
                  onComplete={handlePaymentAndRatingComplete}
                  onBack={() => setShowPayment(false)}
                />
              ) : status === 'completed' && (
                <div className="text-center py-6">
                  <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <FaCheckCircle className="text-green-500 text-3xl" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {pickupComplete ? 'Pickup Completed' : 'Almost Done!'}
                  </h3>
                  <p className="text-gray-600 mb-6">
                    {pickupComplete 
                      ? 'The pickup has been successfully completed and recorded.'
                      : 'Please complete the payment and rating to finalize the pickup.'}
                  </p>
                  {pickupComplete ? (
                    <button
                      onClick={resetScanner}
                      className="w-full bg-primary text-white py-2 px-4 rounded-lg font-medium hover:bg-primary-dark transition-colors"
                    >
                      Scan Another Pickup
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowPayment(true)}
                      className="w-full bg-primary text-white py-2 px-4 rounded-lg font-medium hover:bg-primary-dark transition-colors"
                    >
                      Complete Payment & Rating
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  });

  // Render QR Code Modal
  const renderQRCodeModal = () => {
    if (!showQRCodeModal || !qrCodeData) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-md w-full p-6 relative">
          <button
            onClick={() => setShowQRCodeModal(false)}
            className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
          >
            <FaTimes className="h-6 w-6" />
          </button>
          
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Pickup QR Code</h3>
            <div className="bg-white p-4 rounded-lg inline-block mb-4">
              <div className="p-2 bg-white rounded-lg">
                <QRCodeSVG
                  id="qr-code-svg"
                  value={qrCodeData}
                  size={256}
                  level="H"
                  includeMargin={true}
                  className="mx-auto"
                />
              </div>
            </div>
            
            <p className="text-sm text-gray-500 mb-6">
              Show this QR code to the collector to verify your pickup
            </p>
            
            <div className="flex justify-center space-x-4">
              <button
                onClick={downloadQRCode}
                className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              >
                <FaDownload className="mr-2" />
                Save
              </button>
              
              <button
                onClick={shareQRCode}
                className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              >
                <FaShare className="mr-2" />
                Share
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  // Render pickup details when QR code is scanned
  const renderPickupDetails = () => {
    return (
      <PickupDetails
        currentPickup={currentPickup}
        formData={formData}
        onInputChange={handleInputChange}
        onToggleTag={toggleTag}
        onCapturePhoto={handleCapturePhoto}
        onRemovePhoto={handleRemovePhoto}
        onUpdatePhotoNotes={updatePhotoNotes}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        status={status}
        showPayment={showPayment}
        pickupComplete={pickupComplete}
        onCompletePickup={handleCompletePickup}
      />
    );
  };
  
  // Render error state with improved accessibility
  const renderError = () => {
    if (!error) return null;
    
    return (
      <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded">
        <div className="flex">
          <div className="flex-shrink-0">
            <FaTimesCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <div className="ml-auto pl-3">
            <div className="-mx-1.5 -my-1.5">
              <button
                type="button"
                onClick={() => setError('')}
                className="inline-flex rounded-md bg-red-50 p-1.5 text-red-500 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 focus:ring-offset-red-50"
              >
                <span className="sr-only">Dismiss</span>
                <FaTimes className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Main render function with responsive layout and enhanced accessibility
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Skip to main content link for screen readers */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:ring-2 focus:ring-primary focus:rounded"
      >
        Skip to main content
      </a>
      
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            aria-label="Go back"
          >
            <FaArrowLeft className="text-gray-600 h-5 w-5" aria-hidden="true" />
          </button>
          
          <h1 className="text-lg md:text-xl font-bold text-gray-900" tabIndex="-1">
            {status === 'ready' ? 'Scan Pickup QR Code' : 'Collect Pickup'}
          </h1>
          
          {status !== 'ready' ? (
            <div className="flex items-center space-x-2">
              <button
                onClick={showQRCode}
                className="p-2 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                aria-label="Show QR code for current pickup"
                disabled={isLoading}
              >
                <FaQrcode className="text-primary h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="w-10" aria-hidden="true"></div>
          )}
        </div>
      </header>
      
      {/* Main content */}
      <main id="main-content" className="flex-1 overflow-y-auto px-4 py-2" tabIndex="-1">
        {/* Offline indicator */}
        {isOffline && (
          <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  You're currently offline. Some features may be limited.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Error message */}
        {error && (
          <div className="mb-4">
            {renderError()}
          </div>
        )}
        
        {/* Loading overlay */}
        {isLoading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg flex flex-col items-center">
              <FaSpinner className="animate-spin h-8 w-8 text-primary mb-4" />
              <p className="text-gray-700">Processing your request...</p>
            </div>
          </div>
        )}
        
        <div className="pb-20">
          {status === 'ready' ? renderScanner() : renderPickupDetails()}
        </div>
      </main>
      
      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-2 px-4 fixed bottom-0 w-full max-w-md mx-auto">
        <p className="text-xs text-center text-gray-500">
          {status === 'ready' 
            ? 'Having trouble scanning? Ensure good lighting and try again.'
            : 'Swipe left/right to navigate between sections'}
        </p>
      </footer>
      
      {/* QR Code Modal */}
      {renderQRCodeModal()}
    </div>
  );
};

export default CollectorPickup;
