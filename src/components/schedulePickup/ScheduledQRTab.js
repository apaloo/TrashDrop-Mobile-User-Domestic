import React, { useState, useEffect } from 'react';
import { FaQrcode, FaPlus } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext.js';
import supabase from '../../utils/supabaseClient.js';
import QRCodeList from './QRCodeList.js';



const ScheduledQRTab = ({ scheduledPickups = [], onRefresh, isLoading = false }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('active');
  
  // Handle pickup cancellation
  const handleCancelPickup = async (pickupId) => {
    if (!window.confirm('Are you sure you want to cancel this pickup?')) return;
    
    try {
      if (!pickupId) {
        throw new Error('Invalid pickup ID');
      }
      
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      console.log('Attempting to cancel pickup:', pickupId);
      
      // First, add an optimistic UI update to show the cancellation immediately
      // This makes the UI feel more responsive while the backend operation completes
      const cachedPickups = JSON.parse(localStorage.getItem('scheduledPickups') || '[]');
      const updatedPickups = cachedPickups.map(pickup => 
        pickup.id === pickupId ? { ...pickup, status: 'cancelling...' } : pickup
      );
      localStorage.setItem('scheduledPickups', JSON.stringify(updatedPickups));
      
      // Now perform the actual backend update
      const { data, error } = await supabase
        .from('scheduled_pickups')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString(),
          cancelled_by: user.id
        })
        .eq('id', pickupId)
        .select();
      
      console.log('Cancel pickup response:', { data, error });
      
      if (error) {
        console.error('Supabase error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }
      
      if (!data || data.length === 0) {
        throw new Error('No records were updated. The pickup may not exist or you may not have permission to cancel it.');
      }
      
      console.log('Successfully cancelled pickup:', data[0]);
      
      // Update cached data with the confirmed cancellation
      const finalUpdatedPickups = cachedPickups.map(pickup => 
        pickup.id === pickupId ? { ...pickup, status: 'cancelled' } : pickup
      );
      localStorage.setItem('scheduledPickups', JSON.stringify(finalUpdatedPickups));
      
      // Show success message to user
      alert('Pickup successfully cancelled');
      
      // Refresh the data in the parent component
      if (onRefresh) {
        await onRefresh();
      } else {
        console.warn('onRefresh callback not provided');
      }
      
    } catch (error) {
      console.error('Error cancelling pickup:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      
      // Restore the original state in the cached data
      const cachedPickups = JSON.parse(localStorage.getItem('scheduledPickups') || '[]');
      localStorage.setItem('scheduledPickups', JSON.stringify(cachedPickups));
      
      // More specific error messages based on the error type
      let errorMessage = 'Failed to cancel pickup. ';
      
      if (error.message.includes('permission denied')) {
        errorMessage += 'You do not have permission to cancel this pickup.';
      } else if (error.message.includes('JWT')) {
        errorMessage += 'Authentication error. Please sign in again.';
      } else if (error.message.includes('network')) {
        errorMessage += 'Network error. Please check your internet connection.';
      } else {
        errorMessage += 'Please try again later.';
      }
      
      alert(errorMessage);
    }
  };
  
  // Handle QR code sharing
  const handleShareQRCode = async (pickup) => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `TrashDrop Pickup - ${pickup.location_name || 'Location'}`,
          text: `Here's my TrashDrop pickup QR code for ${pickup.location_name || 'my location'}.`,
          url: pickup.qr_code_url,
        });
      } else {
        // Fallback for browsers that don't support Web Share API
        await navigator.clipboard.writeText(pickup.qr_code_url);
        alert('QR code URL copied to clipboard!');
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Error sharing QR code:', error);
        // Fallback to copying to clipboard if sharing fails
        try {
          await navigator.clipboard.writeText(pickup.qr_code_url);
          alert('QR code URL copied to clipboard!');
        } catch (clipboardError) {
          console.error('Error copying to clipboard:', clipboardError);
          alert('Failed to share QR code. Please try again.');
        }
      }
    }
  };
  
  // Filter pickups based on status with better type safety
  const activePickups = (scheduledPickups || [])
    .filter(pickup => pickup && (pickup.status === 'scheduled' || pickup.status === 'in_progress'))
    .sort((a, b) => (a.pickup_date ? new Date(a.pickup_date) : 0) - (b.pickup_date ? new Date(b.pickup_date) : 0));
    
  const completedPickups = (scheduledPickups || [])
    .filter(pickup => pickup && pickup.status === 'completed')
    .sort((a, b) => (b.pickup_date ? new Date(b.pickup_date) : 0) - (a.pickup_date ? new Date(a.pickup_date) : 0));
    
  const cancelledPickups = (scheduledPickups || [])
    .filter(pickup => pickup && pickup.status === 'cancelled')
    .sort((a, b) => (b.updated_at ? new Date(b.updated_at) : 0) - (a.updated_at ? new Date(a.updated_at) : 0));
    
  const tabs = [
    { 
      id: 'active', 
      label: 'Active', 
      count: activePickups.length,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-600',
      hoverColor: 'hover:bg-blue-50'
    },
    { 
      id: 'completed', 
      label: 'Completed', 
      count: completedPickups.length,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-600',
      hoverColor: 'hover:bg-green-50'
    },
    { 
      id: 'cancelled', 
      label: 'Cancelled', 
      count: cancelledPickups.length,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-600',
      hoverColor: 'hover:bg-red-50'
    },
  ];
  
  const getCurrentPickups = () => {
    switch (activeTab) {
      case 'completed':
        return completedPickups;
      case 'cancelled':
        return cancelledPickups;
      case 'active':
      default:
        return activePickups;
    }
  };
  
  const getEmptyStateMessage = () => {
    switch (activeTab) {
      case 'completed':
        return 'No completed pickups found.';
      case 'cancelled':
        return 'No cancelled pickups found.';
      case 'active':
      default:
        return 'You don\'t have any active pickups. Schedule a new pickup to get started!';
    }
  };

  return (
    <div className="space-y-6">
      {/* Enhanced Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <nav className="flex divide-x divide-gray-200" aria-label="Tabs">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-4 px-2 text-center group relative min-w-0 flex-1 overflow-hidden ${
                  isActive 
                    ? `${tab.bgColor} ${tab.color} font-semibold`
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 font-medium'
                } transition-colors duration-150`}
                aria-current={isActive ? 'page' : undefined}
              >
                <div className="flex flex-col items-center">
                <div className="flex items-center">
                  <span className="text-sm font-medium">{tab.label}</span>
                  <span 
                    className={`ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs ${
                      isActive 
                        ? `${tab.color.replace('text-', 'bg-')} bg-opacity-20`
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                </div>
              </div>
                <div 
                  className={`absolute bottom-0 left-0 right-0 h-0.5 ${
                    isActive ? `${tab.bgColor.replace('bg-', 'bg-opacity-100')} ${tab.color}` : 'bg-transparent'
                  }`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </nav>
      </div>
      
      {/* Empty state for no pickups */}
      {scheduledPickups.length === 0 && !isLoading ? (
        <div className="text-center py-12">
          <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <FaQrcode className="text-gray-400 text-2xl" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Pickups Scheduled</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            You don't have any scheduled pickups yet.
          </p>
        </div>
      ) : (
        <>
          <QRCodeList 
            pickups={getCurrentPickups()}
            onCancelPickup={handleCancelPickup}
            onShareQRCode={handleShareQRCode}
            onRefresh={onRefresh}
            isLoading={isLoading}
            emptyStateMessage={getEmptyStateMessage()}
          />
          
          {/* Help Text */}
          <div className="bg-blue-50 p-4 rounded-lg text-blue-800 text-sm mt-6 flex items-start">
            <FaQrcode className="text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
            <p>Show this QR code to the collector when they arrive for pickup. The QR code contains all the necessary information about your pickup.</p>
          </div>
        </>
      )}
    </div>
  );
};

export default ScheduledQRTab;
