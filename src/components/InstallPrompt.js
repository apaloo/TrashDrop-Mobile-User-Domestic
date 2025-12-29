import React, { useState, useEffect } from 'react';

/**
 * Component that prompts users to install the app as PWA
 * Only shows for first-time users and doesn't reappear after being dismissed or installed
 */
const InstallPrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  
  useEffect(() => {
    // Check if the app has been installed already
    const isAppInstalled = localStorage.getItem('appInstalled') === 'true';
    const hasPromptBeenShown = localStorage.getItem('installPromptShown') === 'true';
    
    // Only show prompt for new users who haven't seen it and haven't installed the app
    if (!isAppInstalled && !hasPromptBeenShown) {
      // Listen for beforeinstallprompt event
      const handleBeforeInstallPrompt = (e) => {
        // Prevent default browser install prompt
        e.preventDefault();
        
        // Store the event for later use
        setDeferredPrompt(e);
        
        // Show our custom prompt
        setShowPrompt(true);
        
        // Mark that we've shown the prompt
        localStorage.setItem('installPromptShown', 'true');
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      
      // Check if app is running in standalone mode (already installed)
      if (window.matchMedia('(display-mode: standalone)').matches || 
          window.navigator.standalone === true) {
        localStorage.setItem('appInstalled', 'true');
        setShowPrompt(false);
      }
      
      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      console.log('Install prompt not available');
      setShowPrompt(false);
      return;
    }
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
      localStorage.setItem('appInstalled', 'true');
    } else {
      console.log('User dismissed the install prompt');
    }
    
    // Clear the deferred prompt
    setDeferredPrompt(null);
    setShowPrompt(false);
  };
  
  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('installPromptShown', 'true');
  };
  
  if (!showPrompt) return null;
  
  return (
    <div className="fixed bottom-20 left-4 right-4 md:bottom-8 md:left-auto md:right-8 md:w-96 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 z-50 border border-gray-200 dark:border-gray-700">
      <div className="flex items-start">
        <div className="flex-shrink-0 mt-1">
          <svg className="h-6 w-6 text-primary" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-gray-800 dark:text-white">Install TrashDrops App</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Add this app to your home screen for easy access and offline functionality!
          </p>
          <div className="mt-3 flex space-x-2">
            <button
              onClick={handleInstallClick}
              className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-5 font-medium rounded-md text-white bg-primary hover:bg-primary-dark focus:outline-none focus:border-primary-dark focus:shadow-outline-primary active:bg-primary-dark transition ease-in-out duration-150"
            >
              Install Now
            </button>
            <button
              onClick={handleDismiss}
              className="inline-flex items-center px-3 py-1 border border-gray-300 dark:border-gray-600 text-sm leading-5 font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:text-gray-500 dark:hover:text-gray-200 focus:outline-none focus:border-blue-300 focus:shadow-outline-blue active:text-gray-800 dark:active:text-gray-50 active:bg-gray-50 dark:active:bg-gray-600 transition ease-in-out duration-150"
            >
              Not Now
            </button>
          </div>
        </div>
        <div className="ml-2">
          <button
            onClick={handleDismiss}
            className="inline-flex text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400"
          >
            <span className="sr-only">Dismiss</span>
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;
