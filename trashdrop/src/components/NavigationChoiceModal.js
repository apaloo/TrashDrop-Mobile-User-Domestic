/**
 * Navigation Choice Modal - Replaces forced auto-navigation with user choice
 * Shows when collector accepts a pickup request
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaMapMarkerAlt, FaHome, FaPhone, FaStar, FaCar } from 'react-icons/fa';

const NavigationChoiceModal = ({ 
  pickup, 
  isVisible, 
  onClose, 
  onChoice,
  position = 'center'
}) => {
  const navigate = useNavigate();

  if (!isVisible || !pickup) return null;

  const handleTrackLive = () => {
    onChoice('track');
    navigate(`/collector-tracking?pickupId=${pickup.id}`);
    onClose();
  };

  const handleStayHere = () => {
    onChoice('stay');
    onClose();
  };

  const handleCallCollector = () => {
    if (pickup.collector?.phone) {
      window.location.href = `tel:${pickup.collector.phone}`;
    }
  };

  const getVehicleIcon = (vehicleType) => {
    switch (vehicleType?.toLowerCase()) {
      case 'truck': return '🚚';
      case 'van': return '🚐';
      case 'motorcycle': return '🏍️';
      case 'bicycle': return '🚲';
      default: return '🚗';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className={`bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto ${
        position === 'bottom' ? 'mb-8' : ''
      }`}>
        {/* Header */}
        <div className="p-6 text-center border-b border-gray-100">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🎉</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Collector Assigned!
          </h2>
          <p className="text-gray-600">
            Your collector is ready to help with your request
          </p>
        </div>

        {/* Collector Info */}
        {pickup.collector && (
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center space-x-4 mb-4">
              <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                {pickup.collector.profile_image_url ? (
                  <img 
                    src={pickup.collector.profile_image_url} 
                    alt={pickup.collector.first_name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-gray-500">👤</span>
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">
                  {pickup.collector.first_name} {pickup.collector.last_name}
                </h3>
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <div className="flex items-center">
                    <FaStar className="text-yellow-400 mr-1" />
                    <span>{pickup.collector.rating || '4.5'}</span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center">
                    <span>{getVehicleIcon(pickup.collector.vehicle_type)}</span>
                    <span className="ml-1">{pickup.collector.vehicle_type || 'Vehicle'}</span>
                  </div>
                </div>
              </div>
            </div>

            {pickup.collector.phone && (
              <button
                onClick={handleCallCollector}
                className="w-full flex items-center justify-center space-x-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <FaPhone className="text-green-600" />
                <span className="text-green-600 font-medium">Call Collector</span>
              </button>
            )}
          </div>
        )}

        {/* Pickup Details */}
        <div className="p-6 border-b border-gray-100">
          <h4 className="font-semibold text-gray-900 mb-3">Request Details</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Type:</span>
              <span className="font-medium capitalize">
                {pickup.is_digital_bin ? 'Digital Bin' : 'Pickup Request'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Bags:</span>
              <span className="font-medium">{pickup.bag_count || 1}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Waste Type:</span>
              <span className="font-medium capitalize">
                {pickup.waste_type || 'General'}
              </span>
            </div>
            {pickup.address && (
              <div className="flex justify-between">
                <span className="text-gray-600">Address:</span>
                <span className="font-medium text-right max-w-[200px] truncate">
                  {pickup.address}
                </span>
              </div>
            )}
            {pickup.fee && (
              <div className="flex justify-between">
                <span className="text-gray-600">Fee:</span>
                <span className="font-medium">GHS {pickup.fee}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 space-y-3">
          <button
            onClick={handleTrackLive}
            className="w-full flex items-center justify-center space-x-2 p-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            <FaMapMarkerAlt />
            <span>Track Live</span>
          </button>
          
          <button
            onClick={handleStayHere}
            className="w-full flex items-center justify-center space-x-2 p-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
          >
            <FaHome />
            <span>Stay on Dashboard</span>
          </button>
        </div>

        {/* Footer Note */}
        <div className="px-6 pb-6">
          <p className="text-center text-sm text-gray-500">
            You can always track from your dashboard later
          </p>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default NavigationChoiceModal;
