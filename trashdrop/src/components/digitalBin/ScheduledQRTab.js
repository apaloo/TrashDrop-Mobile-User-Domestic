import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FaQrcode, FaPlus, FaSync } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext.js';
import supabase from '../../utils/supabaseClient.js';
import QRCodeList from './QRCodeList.js';
import { subscribeToPickupUpdates, handlePickupUpdate } from '../../utils/realtime.js';
import debug from '../../utils/debug.js';

const ScheduledQRTab = ({ scheduledPickups = [], onRefresh, isLoading }) => {

  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('active');
  const [localPickups, setLocalPickups] = useState([]);
  const subscriptionRef = useRef(null);  // Use ref to avoid stale closure in cleanup
  
  // Load persisted QR codes from localStorage on component mount
  useEffect(() => {
    const loadPersistedPickups = () => {
      try {
        debug.log('[ScheduledQRTab] Loading persisted pickups from localStorage');
        const storedPickups = localStorage.getItem('digitalBins');
        debug.log('[ScheduledQRTab] Raw localStorage data:', storedPickups);
        
        if (storedPickups) {
          const parsedPickups = JSON.parse(storedPickups);
          debug.log('[ScheduledQRTab] Parsed pickups:', parsedPickups);
          
          if (Array.isArray(parsedPickups)) {
            setLocalPickups(parsedPickups);
            debug.log('[ScheduledQRTab] Loaded', parsedPickups.length, 'digital bins from localStorage');
            
            // Auto-select tab with most items or active tab by default
            const activeCount = parsedPickups.filter(p => p && (p.status === 'active' || p.status === 'in_service')).length;
            const completedCount = parsedPickups.filter(p => p && p.status === 'completed').length;
            const cancelledCount = parsedPickups.filter(p => p && p.status === 'cancelled').length;
            
            debug.log('[ScheduledQRTab] Counts - Active:', activeCount, 'Completed:', completedCount, 'Cancelled:', cancelledCount);
            
            // If there's a remembered tab in localStorage, use that
            const rememberedTab = localStorage.getItem('digitalBinActiveTab');
            if (rememberedTab) {
              setActiveTab(rememberedTab);
            } else if (completedCount > activeCount && completedCount > cancelledCount) {
              setActiveTab('completed');
            } else if (cancelledCount > activeCount && cancelledCount > completedCount) {
              setActiveTab('cancelled');
            }
            // else stay on active tab
          } else {
            console.warn('[ScheduledQRTab] Parsed data is not an array:', parsedPickups);
          }
        } else {
          debug.log('[ScheduledQRTab] No stored pickups found in localStorage');
        }
      } catch (error) {
        console.error('[ScheduledQRTab] Error loading persisted digital bins:', error);
      }
    };
    
    loadPersistedPickups();
  }, []);
  
  // Subscribe to real-time digital bin updates
  useEffect(() => {
    if (!user) return;
    
    // Subscribe to status changes for all digital bins associated with this user
    const setupSubscription = async () => {
      try {
        const binSubscription = subscribeToPickupUpdates(
          user.id,
          (payload) => {
            console.log('Received digital bin update:', payload);
            handleBinStatusChange(payload.new);
          }
        );
        
        subscriptionRef.current = binSubscription;
      } catch (error) {
        console.error('Error setting up digital bin subscription:', error);
      }
    };
    
    setupSubscription();
    
    return () => {
      // Clean up subscription when component unmounts (using ref avoids stale closure)
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, [user]);
  
  // Memoize validPickups to avoid infinite re-renders
  const validPickups = React.useMemo(() => {
    return scheduledPickups.filter(pickup => {
      if (!pickup.location_id) {
        console.warn('Pickup missing location_id:', pickup);
        return false;
      }
      return true;
    });
  }, [scheduledPickups]);

  // SERVER-FIRST: Use server data directly without complex merging
  useEffect(() => {
    debug.log('[ScheduledQRTab] Received scheduledPickups:', scheduledPickups);
    debug.log('[ScheduledQRTab] Valid pickups:', validPickups);
    
    if (validPickups && validPickups.length >= 0) {
      // Sort by creation date, newest first
      const sortedBins = [...validPickups].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      debug.log('[ScheduledQRTab] Setting localPickups to:', sortedBins);
      setLocalPickups(sortedBins);
      
      // Update localStorage to match (server-first approach)
      localStorage.setItem('digitalBins', JSON.stringify(sortedBins));
    }
  }, [validPickups]);
  
  // Handle real-time updates
  const handleBinStatusChange = useCallback((updatedBin) => {
    setLocalPickups(prevBins => {
      const binIndex = prevBins.findIndex(bin => bin.id === updatedBin.id);
      
      if (binIndex === -1) {
        // New bin, add it
        const newBins = [...prevBins, updatedBin];
        localStorage.setItem('digitalBins', JSON.stringify(newBins));
        return newBins;
      }
      
      // Update existing bin
      const updatedBins = [...prevBins];
      updatedBins[binIndex] = {
        ...updatedBins[binIndex],
        ...updatedBin,
        lastUpdated: new Date().toISOString()
      };
      
      localStorage.setItem('digitalBins', JSON.stringify(updatedBins));
      return updatedBins;
    });
  }, []);
  
  // Filter bins by status
  const activeBins = localPickups.filter(
    bin => bin && (bin.status === 'active' || bin.status === 'in_service')
  );
  
  const completedBins = localPickups.filter(
    bin => bin && bin.status === 'completed'
  );
  
  const cancelledBins = localPickups.filter(
    bin => bin && bin.status === 'cancelled'
  );
  

  
  // Handle bin cancellation
  const handleCancelBin = async (binId) => {
    if (!window.confirm('Are you sure you want to cancel this digital bin? This action cannot be undone.')) {
      return;
    }
    
    try {
      // First update local state optimistically
      const updatedBins = localPickups.map(bin => {
        if (bin.id === binId) {
          return {
            ...bin,
            status: 'cancelled',
            lastUpdated: new Date().toISOString()
          };
        }
        return bin;
      });
      
      setLocalPickups(updatedBins);
      localStorage.setItem('digitalBins', JSON.stringify(updatedBins));
      
      // Then update server - digital bins table
      const { error } = await supabase
        .from('digital_bins')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', binId);
      
      if (error) throw error;
      
      // Refresh data
      onRefresh();
      
    } catch (error) {
      console.error('Error cancelling digital bin:', error);
      
      // Revert local state on error
      const revertedBins = localPickups.map(bin => {
        if (bin.id === binId) {
          return {
            ...bin,
            status: 'active'
          };
        }
        return bin;
      });
      
      setLocalPickups(revertedBins);
      localStorage.setItem('digitalBins', JSON.stringify(revertedBins));
      
      alert('Failed to cancel digital bin. Please try again.');
    }
  };
  
  // Handle QR code sharing
  const handleShareQRCode = async (bin) => {
    if (!bin.qrCode) {
      alert('QR code not available for this digital bin.');
      return;
    }
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Digital Bin QR Code',
          text: `QR Code for Digital Bin at ${bin.location?.address || 'Custom Location'}`,
          url: bin.qrCode
        });
      } else {
        // Fallback for browsers that don't support native sharing
        const tempInput = document.createElement('input');
        document.body.appendChild(tempInput);
        tempInput.value = bin.qrCode;
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        alert('QR code link copied to clipboard!');
      }
    } catch (error) {
      console.error('Error sharing QR code:', error);
      alert('Failed to share QR code. Please try again.');
    }
  };
  
  // Tab configuration
  const tabs = [
    {
      id: 'active',
      label: 'Active',
      count: activeBins.length,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-600',
      hoverColor: 'hover:bg-green-50'
    },
    {
      id: 'completed',
      label: 'Completed',
      count: completedBins.length,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-600',
      hoverColor: 'hover:bg-blue-50'
    },
    {
      id: 'cancelled',
      label: 'Cancelled',
      count: cancelledBins.length,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-600',
      hoverColor: 'hover:bg-red-50'
    },
  ];
  
  const getCurrentBins = () => {
    switch (activeTab) {
      case 'completed':
        return completedBins;
      case 'cancelled':
        return cancelledBins;
      case 'active':
      default:
        return activeBins;
    }
  };
  
  const getEmptyStateMessage = () => {
    switch (activeTab) {
      case 'completed':
        return 'No completed digital bins found.';
      case 'cancelled':
        return 'No cancelled digital bins found.';
      case 'active':
      default:
        return 'You don\'t have any active digital bins. Get a digital bin to start!';
    }
  };

  // Store the active tab selection in localStorage
  useEffect(() => {
    localStorage.setItem('digitalBinActiveTab', activeTab);
  }, [activeTab]);

  return (
    <div className="flex flex-col h-full">
      {/* Enhanced Tabs - Sticky */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 pb-4 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-0">
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 overflow-hidden">
          <nav className="flex divide-x divide-gray-200 dark:divide-gray-600" aria-label="Tabs">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-4 px-2 text-center group relative min-w-0 flex-1 overflow-hidden ${
                  isActive 
                    ? `${tab.bgColor} dark:bg-opacity-20 ${tab.color} font-semibold`
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 font-medium'
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
                        : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
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
      </div>
      
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Empty state for no digital bins */}
        {localPickups.length === 0 && !isLoading ? (
          <div className="text-center py-12">
            <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
              <FaQrcode className="text-gray-400 dark:text-gray-500 text-2xl" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Digital Bins</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              You don't have any digital bins yet.
            </p>
          </div>
        ) : (
          <>
            <QRCodeList 
              pickups={getCurrentBins()}
              onCancelPickup={handleCancelBin}
              onShareQRCode={handleShareQRCode}
              onRefresh={onRefresh}
              isLoading={isLoading}
              emptyStateMessage={getEmptyStateMessage()}
            />
            
            {/* Help Text */}
            <div className="bg-blue-50 dark:bg-blue-900 dark:bg-opacity-20 p-4 rounded-lg text-blue-800 dark:text-blue-300 text-sm mt-6 flex items-start">
              <FaQrcode className="text-blue-500 dark:text-blue-400 mt-0.5 mr-2 flex-shrink-0" />
              <p>Show this QR code to the service provider when they arrive. The QR code contains all the necessary information about your digital bin service.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ScheduledQRTab;
