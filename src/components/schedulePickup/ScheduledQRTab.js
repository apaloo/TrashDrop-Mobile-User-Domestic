import React, { useState, useEffect, useCallback } from 'react';
import { FaQrcode, FaPlus, FaSync } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext.js';
import supabase from '../../utils/supabaseClient.js';
import QRCodeList from './QRCodeList.js';
import { subscribeToPickupUpdates, handlePickupUpdate } from '../../utils/realtime.js';



const ScheduledQRTab = ({ scheduledPickups = [], onRefresh, isLoading = false }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('active');
  const [localPickups, setLocalPickups] = useState([]);
  const [subscription, setSubscription] = useState(null);
  
  // Load persisted QR codes from localStorage on component mount
  useEffect(() => {
    const loadPersistedPickups = () => {
      try {
        const storedPickups = localStorage.getItem('scheduledPickups');
        if (storedPickups) {
          const parsedPickups = JSON.parse(storedPickups);
          if (Array.isArray(parsedPickups)) {
            setLocalPickups(parsedPickups);
            console.log('Loaded', parsedPickups.length, 'pickups from localStorage');
            
            // Auto-select tab with most items or active tab by default
            const activeCount = parsedPickups.filter(p => p && (p.status === 'scheduled' || p.status === 'in_progress')).length;
            const completedCount = parsedPickups.filter(p => p && p.status === 'completed').length;
            const cancelledCount = parsedPickups.filter(p => p && p.status === 'cancelled').length;
            
            // If there's a remembered tab in localStorage, use that
            const rememberedTab = localStorage.getItem('scheduledQRActiveTab');
            if (rememberedTab) {
              setActiveTab(rememberedTab);
            } else if (completedCount > activeCount && completedCount > cancelledCount) {
              setActiveTab('completed');
            } else if (cancelledCount > activeCount && cancelledCount > completedCount) {
              setActiveTab('cancelled');
            }
            // else stay on active tab
          }
        }
      } catch (error) {
        console.error('Error loading persisted pickups:', error);
      }
    };
    
    loadPersistedPickups();
  }, []);
  
  // Subscribe to real-time pickup updates
  useEffect(() => {
    if (!user) return;
    
    // Subscribe to status changes for all pickups associated with this user
    const setupSubscription = async () => {
      try {
        const pickupSubscription = subscribeToPickupUpdates(
          user.id,
          (payload) => {
            console.log('Received pickup update:', payload);
            handlePickupStatusChange(payload.new);
          }
        );
        
        setSubscription(pickupSubscription);
      } catch (error) {
        console.error('Error setting up pickup subscription:', error);
      }
    };
    
    setupSubscription();
    
    return () => {
      // Clean up subscription when component unmounts
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [user]);
  
  // Sync merged data from props and local storage
  useEffect(() => {
    if (!scheduledPickups || scheduledPickups.length === 0) return;
    
    // Merge remote pickups with local persisted data
    const mergePickups = () => {
      // Create a map of existing local pickups by ID for quick lookup
      const localPickupsMap = new Map(
        localPickups.map(pickup => [pickup.id, pickup])
      );
      
      // Create merged array, prioritizing server data but keeping local-only items
      const mergedPickups = scheduledPickups.map(remotePickup => {
        const localPickup = localPickupsMap.get(remotePickup.id);
        // Remove this ID from the map so we know what's left is local-only
        localPickupsMap.delete(remotePickup.id);
        
        // Special handling for status changes to ensure we don't overwrite completed/cancelled status
        // with older server data if the change happened offline
        if (localPickup && 
            (localPickup.status === 'completed' || localPickup.status === 'cancelled') && 
            remotePickup.status === 'scheduled') {
          // Keep the local status if it's more definitive (completed/cancelled)
          return {
            ...remotePickup,
            status: localPickup.status,
            updated_at: localPickup.updated_at
          };
        }
        
        // Otherwise, merge remote with local data (remote takes priority)
        return {
          ...localPickup,
          ...remotePickup
        };
      });
      
      // Add any local-only pickups that weren't in the server data
      const localOnlyPickups = Array.from(localPickupsMap.values());
      const allPickups = [...mergedPickups, ...localOnlyPickups];
      
      // Persist the merged list to localStorage with timestamp
      const timestamp = new Date().toISOString();
      localStorage.setItem('scheduledPickups', JSON.stringify(allPickups));
      localStorage.setItem('scheduledPickupsLastUpdated', timestamp);
      setLocalPickups(allPickups);
    };
    
    mergePickups();
  }, [scheduledPickups, localPickups]);
  
  // Handle pickup status changes (from collector scan or cancellation)
  const handlePickupStatusChange = useCallback((updatedPickup) => {
    if (!updatedPickup || !updatedPickup.id) return;
    
    setLocalPickups(prevPickups => {
      const updatedPickups = prevPickups.map(pickup => 
        pickup.id === updatedPickup.id ? { ...pickup, ...updatedPickup } : pickup
      );
      
      // Persist to localStorage with timestamp
      const timestamp = new Date().toISOString();
      localStorage.setItem('scheduledPickups', JSON.stringify(updatedPickups));
      localStorage.setItem('scheduledPickupsLastUpdated', timestamp);
      
      return updatedPickups;
    });
    
    // If the current active tab doesn't match the new status, provide UI feedback
    if (
      (updatedPickup.status === 'completed' && activeTab !== 'completed') ||
      (updatedPickup.status === 'cancelled' && activeTab !== 'cancelled')
    ) {
      // Flash notification that an item moved to another tab
      const statusText = updatedPickup.status === 'completed' ? 'completed' : 'cancelled';
      const notification = document.createElement('div');
      notification.className = 'fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-80 text-white px-4 py-2 rounded-full text-sm z-50';
      notification.textContent = `A pickup was just ${statusText}. Check the ${statusText} tab.`;
      document.body.appendChild(notification);
      
      // Remove notification after 3 seconds
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 3000);
    }
  }, [activeTab]);
  
  // Handle status changes from real-time updates
  useEffect(() => {
    if (!user) return;
    
    const handleRealtimeUpdate = (payload) => {
      console.log('Received real-time pickup update:', payload);
      
      if (payload.new && payload.new.status) {
        const updatedPickup = payload.new;
        
        // Update the pickup in our local state
        handlePickupStatusChange(updatedPickup);
        
        // If automatic tab switching is desired, switch to the appropriate tab
        const autoSwitchTabs = localStorage.getItem('autoSwitchPickupTabs') !== 'false';
        if (autoSwitchTabs) {
          if (updatedPickup.status === 'completed' && activeTab !== 'completed') {
            setActiveTab('completed');
          } else if (updatedPickup.status === 'cancelled' && activeTab !== 'cancelled') {
            setActiveTab('cancelled');
          }
        }
      }
    };
    
    // Set up a real-time subscription specifically for status updates
    const statusSubscription = supabase
      .channel('pickup-status-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scheduled_pickups',
          filter: `user_id=eq.${user.id}`,
        },
        handleRealtimeUpdate
      )
      .subscribe();
    
    return () => {
      statusSubscription.unsubscribe();
    };
  }, [user, activeTab, handlePickupStatusChange]);
  
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
      setLocalPickups(prevPickups => {
        const updatedPickups = prevPickups.map(pickup => 
          pickup.id === pickupId ? { ...pickup, status: 'cancelling...' } : pickup
        );
        
        // Store the timestamp with the update for offline-first synchronization
        const timestamp = new Date().toISOString();
        localStorage.setItem('scheduledPickups', JSON.stringify(updatedPickups));
        localStorage.setItem('scheduledPickupsLastUpdated', timestamp);
        
        return updatedPickups;
      });
      
      // Auto-switch to cancelled tab if desired
      const autoSwitchTabs = localStorage.getItem('autoSwitchPickupTabs') !== 'false';
      if (autoSwitchTabs) {
        setActiveTab('cancelled');
      }
      
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
      
      // Update local state with the confirmed cancellation
      setLocalPickups(prevPickups => {
        const finalUpdatedPickups = prevPickups.map(pickup => 
          pickup.id === pickupId ? { ...pickup, status: 'cancelled', updated_at: new Date().toISOString() } : pickup
        );
        
        // Store the timestamp with the update for offline-first synchronization
        const timestamp = new Date().toISOString();
        localStorage.setItem('scheduledPickups', JSON.stringify(finalUpdatedPickups));
        localStorage.setItem('scheduledPickupsLastUpdated', timestamp);
        
        return finalUpdatedPickups;
      });
      
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
      try {
        const cachedPickups = JSON.parse(localStorage.getItem('scheduledPickups') || '[]');
        setLocalPickups(cachedPickups);
      } catch (cacheError) {
        console.error('Error restoring cached pickups:', cacheError);
      }
      
      // More specific error messages based on the error type
      let errorMessage = 'Failed to cancel pickup. ';
      
      if (error.message.includes('permission denied')) {
        errorMessage += 'You do not have permission to cancel this pickup.';
      } else if (error.message.includes('JWT')) {
        errorMessage += 'Authentication error. Please sign in again.';
      } else if (error.message.includes('network')) {
        errorMessage += 'Network error. Please check your internet connection and try again. Your changes will be saved locally until you reconnect.';
      } else {
        errorMessage += 'Please try again later.';
      }
      
      alert(errorMessage);
      
      // If network error, store the pending cancellation to retry later
      if (error.message.includes('network')) {
        const pendingCancellations = JSON.parse(localStorage.getItem('pendingPickupCancellations') || '[]');
        if (!pendingCancellations.includes(pickupId)) {
          pendingCancellations.push(pickupId);
          localStorage.setItem('pendingPickupCancellations', JSON.stringify(pendingCancellations));
        }
      }
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
  
  // Filter pickups based on status with better type safety - use localPickups instead of scheduledPickups
  const activePickups = (localPickups || [])
    .filter(pickup => pickup && (pickup.status === 'scheduled' || pickup.status === 'in_progress'))
    .sort((a, b) => (a.pickup_date ? new Date(a.pickup_date) : 0) - (b.pickup_date ? new Date(b.pickup_date) : 0));
    
  const completedPickups = (localPickups || [])
    .filter(pickup => pickup && pickup.status === 'completed')
    .sort((a, b) => (b.pickup_date ? new Date(b.pickup_date) : 0) - (a.pickup_date ? new Date(a.pickup_date) : 0));
    
  const cancelledPickups = (localPickups || [])
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

  // Store the active tab selection in localStorage
  useEffect(() => {
    localStorage.setItem('scheduledQRActiveTab', activeTab);
  }, [activeTab]);

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
