import React, { useState, useEffect } from 'react';
import { FaChevronDown, FaChevronUp, FaQrcode, FaCalendarAlt, FaMapMarkerAlt, 
  FaTrash, FaInfoCircle, FaClock, FaCheckCircle, FaExclamationTriangle, FaShare,
  FaSpinner, FaSync, FaExpand, FaTimes } from 'react-icons/fa';
import supabase from '../../utils/supabaseClient.js';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { getQRCode, storeQRCode } from '../../utils/qrStorage.js';
import { getBinSizeLabelShort } from '../../utils/costCalculator.js';

// Status badge component
const StatusBadge = ({ status }) => {
  const statusInfo = getStatusInfo(status);
  
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusInfo.color} inline-flex items-center`}>
      {statusInfo.icon}
      <span className="ml-1">{statusInfo.label}</span>
    </span>
  );
};

// Helper function to get status info
const getStatusInfo = (status) => {
  switch (status?.toLowerCase()) {
    case 'active':
      return {
        icon: <FaClock className="mr-1" />,
        color: 'bg-blue-100 text-blue-800',
        label: 'Active'
      };
    case 'in_service':
      return {
        icon: <FaClock className="mr-1 animate-pulse" />,
        color: 'bg-yellow-100 text-yellow-800',
        label: 'In Service'
      };
    case 'completed':
      return {
        icon: <FaCheckCircle className="mr-1" />,
        color: 'bg-green-100 text-green-800',
        label: 'Completed'
      };
    case 'cancelled':
      return {
        icon: <FaExclamationTriangle className="mr-1" />,
        color: 'bg-red-100 text-red-800',
        label: 'Cancelled'
      };
    default:
      return {
        icon: <FaClock className="mr-1" />,
        color: 'bg-gray-100 text-gray-800',
        label: 'Pending'
      };
  }
};

// Format date to relative time (e.g., "2 days from now")
const formatRelativeTime = (dateString) => {
  try {
    return formatDistanceToNow(parseISO(dateString), { addSuffix: true });
  } catch (e) {
    return '';
  }
};

// Single QR code card component
const QRCodeCard = ({ pickup, onCancel, onShare, onRefresh }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isQrExpanded, setIsQrExpanded] = useState(false);
  const [isFullScreenQR, setIsFullScreenQR] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState(pickup.qr_code_url);
  const [qrCodeData, setQrCodeData] = useState(null);
  
  // Load QR code from local storage when component mounts
  useEffect(() => {
    const loadQRCode = async () => {
      if (pickup.location_id) {
        try {
          const qrData = await getQRCode(pickup.location_id);
          if (qrData) {
            setQrCodeData(qrData);
            // Use the local QR code URL if available, otherwise fallback to pickup.qr_code_url
            setQrCodeUrl(qrData.qrCodeUrl || pickup.qr_code_url);
            console.log('Loaded QR code for location:', pickup.location_id);
          } else {
            console.log('No QR code found for location:', pickup.location_id);
          }
        } catch (error) {
          console.error('Error loading QR code:', error);
        }
      }
    };
    
    loadQRCode();
  }, [pickup.location_id, pickup.qr_code_url]);

  // Close expanded QR when card is collapsed
  useEffect(() => {
    if (!isExpanded) {
      setIsQrExpanded(false);
    }
  }, [isExpanded]);
  
  const toggleExpand = () => setIsExpanded(!isExpanded);
  
  const handleShare = (e) => {
    e.stopPropagation();
    onShare(pickup);
  };
  
  const handleCancel = (e) => {
    e.stopPropagation();
    onCancel(pickup.id);
  };
  
  const handleRefreshQR = async (e) => {
    e.stopPropagation();
    const locationId = pickup.location_id;
    
    // Validate location_id
    if (!locationId) {
      console.error('Invalid location_id:', locationId);
      onRefresh?.({ error: 'Invalid location ID. Please try again.' });
      return;
    }
    
    setIsLoading(true);
    try {
      console.log('Refreshing QR code for location:', locationId);
      
      // Generate a new QR code using our local-first approach with Supabase sync
      const newQrData = await storeQRCode(locationId, null, {
        binId: pickup.id || `bin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        syncToSupabase: true // Enable Supabase sync for persistence
      });
      
      if (newQrData) {
        setQrCodeData(newQrData);
        setQrCodeUrl(newQrData.qrCodeUrl);
        console.log('Generated new QR code for location:', locationId);
        onRefresh?.({ success: true });
      } else {
        throw new Error('Failed to generate QR code');
      }
    } catch (error) {
      console.error('Error refreshing QR code:', error);
      onRefresh?.({ error: 'Failed to refresh QR code. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Full-screen QR handlers
  const handleQRClick = (e) => {
    e.stopPropagation();
    setIsFullScreenQR(true);
  };
  
  const handleCloseFullScreen = () => {
    setIsFullScreenQR(false);
  };
  
  // Handle escape key to close full-screen modal
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape' && isFullScreenQR) {
        setIsFullScreenQR(false);
      }
    };
    
    if (isFullScreenQR) {
      document.addEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'auto';
    };
  }, [isFullScreenQR]);
  
  return (
    <div 
      className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4 transition-all duration-200 ${
        pickup.status === 'cancelled' ? 'opacity-70' : ''
      }`}
    >
      {/* Header */}
      <div 
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={toggleExpand}
      >
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <StatusBadge status={pickup.status} />
              
              {/* Bin Size Badge */}
              {pickup.bin_size_liters && (
                <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-800 text-xs font-semibold">
                  {getBinSizeLabelShort(pickup.bin_size_liters)}
                </span>
              )}
              
              {/* Urgent Badge */}
              {pickup.is_urgent && (
                <span className="inline-flex items-center px-2 py-1 rounded-md bg-yellow-100 text-yellow-800 text-xs font-semibold">
                  ⚡ Urgent
                </span>
              )}
              
              <span className="text-sm text-gray-500">
                {formatRelativeTime(pickup.created_at)}
              </span>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              Digital Bin #{pickup.id}
            </h3>
            <p className="text-sm text-gray-600">
              {pickup.address || 'Custom Location'}
            </p>
          </div>
          <button 
            className={`ml-4 text-gray-400 hover:text-gray-600 transition-colors ${isExpanded ? 'transform rotate-180' : ''}`}
          >
            <FaChevronDown />
          </button>
        </div>
      </div>
      
      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-100">
          {/* QR Code Section */}
          <div className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-sm font-medium text-gray-900">Digital Bin QR Code</h4>
              <div className="flex space-x-2">
                <button
                  onClick={handleQRClick}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                  title="Expand QR Code"
                >
                  <FaExpand size={16} />
                </button>
                <button
                  onClick={handleShare}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                  title="Share QR Code"
                >
                  <FaShare size={16} />
                </button>
                <button
                  onClick={handleRefreshQR}
                  className={`text-gray-500 hover:text-gray-700 transition-colors ${isLoading ? 'animate-spin' : ''}`}
                  title="Refresh QR Code"
                  disabled={isLoading}
                >
                  <FaSync size={16} />
                </button>
              </div>
            </div>
            
            <div 
              className={`relative bg-gray-50 rounded-lg overflow-hidden transition-all duration-200 cursor-pointer group ${
                isQrExpanded ? 'h-64' : 'h-32'
              }`}
              onClick={handleQRClick}
              title="Click to expand QR code"
            >
              {qrCodeUrl ? (
                <>
                  <img
                    src={qrCodeUrl}
                    alt="Digital Bin QR Code"
                    className={`w-full h-full object-contain transition-opacity duration-200 ${
                      isImageLoaded ? 'opacity-100' : 'opacity-0'
                    }`}
                    onLoad={() => setIsImageLoaded(true)}
                  />
                  {!isImageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <FaSpinner className="animate-spin text-gray-400" size={24} />
                    </div>
                  )}
                  {/* Hover overlay for expand hint */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white rounded-full p-3 shadow-lg">
                      <FaExpand className="text-gray-600" size={20} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-gray-400">QR Code not available</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Details Section */}
          <div className="p-4 border-t border-gray-100">
            <div className="space-y-4">
              <div className="flex items-start">
                <FaCalendarAlt className="mt-1 mr-2 text-gray-400 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Service Schedule</h4>
                  <p className="text-gray-900">
                    {pickup.frequency && pickup.preferred_time
                      ? `${pickup.frequency.charAt(0).toUpperCase() + pickup.frequency.slice(1)} • ${
                          pickup.preferred_time === 'morning'
                            ? 'Morning (8am - 12pm)'
                            : pickup.preferred_time === 'afternoon'
                            ? 'Afternoon (12pm - 4pm)'
                            : 'Evening (4pm - 8pm)'
                          }`
                      : 'Not specified'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-start">
                <FaMapMarkerAlt className="mt-1 mr-2 text-gray-400 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Location</h4>
                  <p className="text-gray-900 break-words">
                    {pickup.address || 'No address provided'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-start">
                <FaInfoCircle className="mt-1 mr-2 text-gray-400 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Bin Details</h4>
                  <p className="text-gray-900">
                    <span className="capitalize">{pickup.waste_type?.toLowerCase() || 'general'}</span>
                    {' • '}
                    {pickup.bag_count} bin{pickup.bag_count !== 1 ? 's' : ''}
                    {pickup.bin_size_liters && (
                      <span>
                        {' • '}
                        <span className="font-semibold">{getBinSizeLabelShort(pickup.bin_size_liters)}</span>
                      </span>
                    )}
                    {pickup.is_urgent && (
                      <span className="ml-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                          ⚡ Urgent
                        </span>
                      </span>
                    )}
                  </p>
                </div>
              </div>
              
              <div className="flex items-start">
                <FaClock className="mt-1 mr-2 text-gray-400 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Status</h4>
                  <div className="flex items-center">
                    <StatusBadge status={pickup.status} />
                  </div>
                </div>
              </div>
            </div>
            
            {pickup.special_instructions && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Special Instructions</h4>
                <p className="text-gray-700 whitespace-pre-line">{pickup.special_instructions}</p>
              </div>
            )}
            
            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between">
              <button 
                className="text-gray-600 hover:text-gray-800 text-sm font-medium"
                onClick={toggleExpand}
              >
                Show Less
              </button>
              
              {pickup.status === 'active' && (
                <button 
                  className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center"
                  onClick={handleCancel}
                >
                  <FaTrash className="mr-1" size={12} />
                  Cancel Digital Bin
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Full-screen QR Modal */}
      {isFullScreenQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90">
          <div className="relative max-w-2xl max-h-[90vh] w-full h-full flex items-center justify-center p-4">
            {/* Close button */}
            <button
              onClick={handleCloseFullScreen}
              className="absolute top-4 right-4 z-10 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full p-3 transition-all duration-200"
              title="Close (ESC)"
            >
              <FaTimes className="text-white" size={24} />
            </button>
            
            {/* QR Code */}
            <div className="bg-white rounded-lg p-8 shadow-2xl max-w-full max-h-full flex flex-col items-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
                Digital Bin QR Code
              </h3>
              <p className="text-sm text-gray-600 mb-6 text-center">
                {pickup.location_name || 'Custom Location'}
              </p>
              
              {qrCodeUrl ? (
                <img
                  src={qrCodeUrl}
                  alt="Digital Bin QR Code - Full Screen"
                  className="max-w-full max-h-[60vh] object-contain"
                  style={{ minWidth: '300px', minHeight: '300px' }}
                />
              ) : (
                <div className="w-80 h-80 bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-gray-400">QR Code not available</span>
                </div>
              )}
              
              <p className="text-xs text-gray-500 mt-4 text-center max-w-md">
                Show this QR code to the service provider when they arrive. 
                The QR code contains all necessary information about your digital bin service.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Main QR code list component
const QRCodeList = ({ 
  pickups = [], 
  onCancelPickup, 
  onShareQRCode,
  isLoading = false,
  emptyStateMessage = "No digital bins found."
}) => {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (pickups.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <FaQrcode className="text-gray-400 text-2xl" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Digital Bins</h3>
        <p className="text-gray-500 max-w-md mx-auto">
          {emptyStateMessage}
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {pickups.map((pickup) => (
        <QRCodeCard 
          key={pickup.id} 
          pickup={pickup} 
          onCancel={onCancelPickup}
          onShare={onShareQRCode}
        />
      ))}
    </div>
  );
};

export default QRCodeList;
