import React, { useState, useEffect } from 'react';
import { FiWifiOff, FiX, FiCheck } from 'react-icons/fi';

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
      <div className="fixed top-0 left-0 right-0 z-50 bg-td-forest text-white" role="status">
        <div className="flex items-center justify-center px-4 py-2.5">
          <FiCheck aria-hidden="true" className="w-4 h-4 mr-2" />
          <p className="text-sm font-medium">You're back online</p>
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
    <div className="fixed top-0 left-0 right-0 z-50 bg-td-ink text-white" role="status">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <FiWifiOff aria-hidden="true" className="w-5 h-5 flex-shrink-0 text-td-lime" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">You're offline</p>
          <p className="text-[13px] text-td-sage-dark">
            Connect to Wi-Fi or mobile data. The app picks up again by itself.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="p-2 -mr-2 rounded-full hover:bg-white/10 transition-colors"
          aria-label="Dismiss network warning"
        >
          <FiX aria-hidden="true" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default NetworkStatusRibbon;
