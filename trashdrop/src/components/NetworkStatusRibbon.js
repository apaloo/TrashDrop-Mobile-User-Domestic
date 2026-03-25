import React, { useState, useEffect } from 'react';
import { FiWifiOff, FiWifi, FiAlertTriangle, FiX, FiCheck } from 'react-icons/fi';

/**
 * NetworkStatusRibbon - Displays network connectivity status prominently
 * Shows when user is offline or experiencing network issues, and when connection is restored
 */
const NetworkStatusRibbon = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineWarning, setShowOfflineWarning] = useState(!navigator.onLine);
  const [dismissed, setDismissed] = useState(false);
  const [showOnlineIndicator, setShowOnlineIndicator] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      console.log('[NetworkStatusRibbon] Connection restored');
      setIsOnline(true);
      setShowOfflineWarning(false);
      setDismissed(false); // Reset dismissed state when coming back online
      // Remove body padding when coming back online
      document.body.style.paddingTop = '';
      // Show online indicator for 3 seconds
      setShowOnlineIndicator(true);
      setTimeout(() => setShowOnlineIndicator(false), 3000);
    };

    const handleOffline = () => {
      console.log('[NetworkStatusRibbon] Connection lost');
      setIsOnline(false);
      setShowOfflineWarning(true);
      setDismissed(false);
      setShowOnlineIndicator(false);
    };

    // Add event listeners for network status changes
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup event listeners
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      // Clean up body padding on unmount
      document.body.style.paddingTop = '';
    };
  }, []);

  // Add/remove body padding when ribbon is shown/hidden
  useEffect(() => {
    if ((!isOnline && !dismissed) || (isOnline && showOnlineIndicator)) {
      // Add padding to account for ribbon height (approximately 60px for offline, 40px for online)
      const padding = !isOnline ? '60px' : '40px';
      document.body.style.paddingTop = padding;
    } else {
      document.body.style.paddingTop = '';
    }
    
    // Cleanup padding on unmount
    return () => {
      document.body.style.paddingTop = '';
    };
  }, [isOnline, dismissed, showOnlineIndicator]);

  // Don't show anything if online and no indicator showing
  if (isOnline && !showOnlineIndicator) {
    return null;
  }

  // Show online indicator when connection is restored
  if (isOnline && showOnlineIndicator) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-green-600 text-white">
        <div className="flex items-center justify-center px-4 py-2">
          <FiCheck className="w-4 h-4 mr-2" />
          <p className="text-sm font-medium">
            Connection restored - You're back online!
          </p>
        </div>
        
        {/* Success animation */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-green-400">
          <div className="h-full bg-green-300 animate-pulse"></div>
        </div>
      </div>
    );
  }

  const handleDismiss = () => {
    setDismissed(true);
    document.body.style.paddingTop = ''; // Remove padding when dismissed
    console.log('[NetworkStatusRibbon] Warning dismissed by user');
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center space-x-3">
          <FiWifiOff className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              You are not connected to the internet
            </p>
            <p className="text-xs opacity-90">
              Please ensure you are connected to the internet to continue using the app
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="ml-4 p-1 rounded-md hover:bg-red-700 transition-colors"
          aria-label="Dismiss network warning"
        >
          <FiX className="w-4 h-4" />
        </button>
      </div>
      
      {/* Pulsing animation to draw attention */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-red-400">
        <div className="h-full bg-red-300 animate-pulse"></div>
      </div>
    </div>
  );
};

export default NetworkStatusRibbon;
