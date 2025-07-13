import React, { useState, useEffect } from 'react';
import { FaChevronDown, FaChevronUp, FaQrcode, FaCalendarAlt, FaMapMarkerAlt, 
  FaTrash, FaInfoCircle, FaClock, FaCheckCircle, FaExclamationTriangle, FaShare,
  FaSpinner, FaSync } from 'react-icons/fa';
import { supabase } from '../../utils/supabaseClient';
import { formatDistanceToNow, parseISO } from 'date-fns';

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
    case 'scheduled':
      return {
        icon: <FaClock className="mr-1" />,
        color: 'bg-blue-100 text-blue-800',
        label: 'Scheduled'
      };
    case 'in_progress':
      return {
        icon: <FaClock className="mr-1 animate-pulse" />,
        color: 'bg-yellow-100 text-yellow-800',
        label: 'In Progress'
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
  const [qrCodeUrl, setQrCodeUrl] = useState(pickup.qr_code_url);
  
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
    if (!pickup.id) return;
    
    setIsLoading(true);
    try {
      // Try to get the latest QR code from the database
      const response = await fetch(`/api/pickups/${pickup.id}/qr-code`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabase.auth.session()?.access_token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.qr_code_url) {
          setQrCodeUrl(data.qr_code_url);
          return;
        }
      }
      
      // Fallback: Generate a new QR code URL
      const newQrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=trashdrop-${pickup.id}`;
      setQrCodeUrl(newQrCodeUrl);
      
      // Update the pickup with the new QR code URL
      await supabase
        .from('scheduled_pickups')
        .update({ qr_code_url: newQrCodeUrl })
        .eq('id', pickup.id);
        
    } catch (error) {
      console.error('Error refreshing QR code:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div 
      className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4 transition-all duration-200 ${
        pickup.status === 'cancelled' ? 'opacity-70' : ''
      }`}
    >
      {/* Header */}
      <div 
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
        onClick={toggleExpand}
      >
        <div className="flex items-center">
          <div className="bg-gray-100 p-2 rounded-lg mr-3">
            <FaQrcode className="text-gray-500 text-xl" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">
              {pickup.location_name || 'Pickup Location'}
            </h3>
            <p className="text-sm text-gray-500">
              {pickup.pickup_date ? formatRelativeTime(pickup.pickup_date) : 'No date set'}
            </p>
          </div>
        </div>
        <div className="flex items-center">
          <StatusBadge status={pickup.status} />
          <span className="ml-3 text-gray-400">
            {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
          </span>
        </div>
      </div>
      
      {/* Expandable content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100">
          <div className="flex flex-col md:flex-row gap-6">
            {/* QR Code */}
            <div className="flex-shrink-0 flex flex-col items-center">
              <div 
                className="p-2 bg-white border border-gray-200 rounded-lg mb-3 relative cursor-pointer hover:shadow-md transition-shadow"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsQrExpanded(true);
                }}
              >
                {qrCodeUrl ? (
                  <>
                    <div className="relative group">
                      <img 
                        src={qrCodeUrl} 
                        alt="Pickup QR Code" 
                        className={`w-48 h-48 object-contain ${isImageLoaded ? 'block' : 'hidden'}`}
                        onLoad={() => setIsImageLoaded(true)}
                        onError={(e) => {
                          console.warn('Error loading QR code image, showing placeholder');
                          setIsImageLoaded(false);
                        }}
                      />
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 flex items-center justify-center transition-all duration-200 rounded">
                        <span className="text-white bg-black bg-opacity-70 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                          Tap to enlarge
                        </span>
                      </div>
                    </div>
                    {!isImageLoaded && (
                      <div className="w-48 h-48 flex items-center justify-center bg-gray-100">
                        <FaQrcode className="text-gray-300 text-4xl animate-pulse" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-48 h-48 flex flex-col items-center justify-center bg-gray-100 p-4 text-center">
                    <FaQrcode className="text-gray-300 text-4xl mb-2" />
                    <p className="text-xs text-gray-500">No QR code available</p>
                    <button 
                      onClick={handleRefreshQR}
                      disabled={isLoading}
                      className="mt-2 text-xs text-primary hover:underline flex items-center"
                    >
                      {isLoading ? (
                        <>
                          <FaSpinner className="animate-spin mr-1" />
                          Refreshing...
                        </>
                      ) : (
                        'Try Again'
                      )}
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 text-center mt-1 mb-2">
                Tap QR code to enlarge for scanning
              </p>
              
              {/* Expanded QR Code Modal */}
              {isQrExpanded && qrCodeUrl && (
                <div 
                  className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
                  onClick={() => setIsQrExpanded(false)}
                >
                  <div className="bg-white rounded-xl p-6 max-w-md w-full mx-auto relative" onClick={e => e.stopPropagation()}>
                    <h3 className="text-lg font-medium text-gray-900 mb-4 text-center">
                      Scan this QR Code
                    </h3>
                    <div className="bg-white p-4 rounded-lg border-2 border-dashed border-gray-300 flex justify-center mb-4">
                      <img 
                        src={qrCodeUrl.replace('size=200x200', 'size=300x300')} 
                        alt="Full Screen QR Code" 
                        className="w-full max-w-xs h-auto"
                      />
                    </div>
                    <p className="text-sm text-gray-600 text-center mb-4">
                      Show this code to the collector at pickup time
                    </p>
                    <div className="flex justify-center space-x-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShare(e);
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
                      >
                        <FaShare className="mr-2" />
                        Share
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsQrExpanded(false);
                        }}
                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex justify-between text-sm w-full mt-2">
                <button 
                  onClick={handleShare}
                  className="text-primary font-medium flex items-center hover:underline"
                  disabled={!qrCodeUrl}
                >
                  <FaShare className="mr-1" /> Share
                </button>
                <button 
                  onClick={handleRefreshQR}
                  className="text-gray-500 hover:text-gray-700 flex items-center text-xs"
                  disabled={isLoading}
                  title="Refresh QR Code"
                >
                  {isLoading ? (
                    <FaSpinner className="animate-spin mr-1" />
                  ) : (
                    <FaSync className="mr-1" />
                  )}
                  Refresh
                </button>
              </div>
            </div>
            
            {/* Details */}
            <div className="flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="flex items-start">
                  <FaCalendarAlt className="mt-1 mr-2 text-gray-400 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Pickup Date</h4>
                    <p className="text-gray-900">
                      {pickup.pickup_date 
                        ? new Date(pickup.pickup_date).toLocaleString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
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
                    <h4 className="text-sm font-medium text-gray-500">Waste Type</h4>
                    <p className="text-gray-900 capitalize">
                      {pickup.waste_type?.toLowerCase() || 'general waste'} • {pickup.bag_count} bag{pickup.bag_count !== 1 ? 's' : ''}
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
                
                {pickup.status === 'scheduled' && (
                  <button 
                    className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center"
                    onClick={handleCancel}
                  >
                    <FaTrash className="mr-1" size={12} />
                    Cancel Pickup
                  </button>
                )}
              </div>
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
  emptyStateMessage = "No scheduled pickups found."
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
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Pickups Scheduled</h3>
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
