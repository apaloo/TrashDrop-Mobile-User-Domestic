import React, { useState, useEffect, useCallback } from 'react';

/**
 * Force Install Prompt - Full-screen modal shown on first app visit
 * Prompts users to install the PWA for best experience
 */
const ForceInstallPrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode (PWA installed)
    const standalone = window.matchMedia('(display-mode: standalone)').matches || 
                      window.navigator.standalone === true;
    setIsStandalone(standalone);
    
    if (standalone) {
      localStorage.setItem('trashdrop_app_installed', 'true');
      return;
    }

    // Check if this is first visit
    const hasSeenPrompt = localStorage.getItem('trashdrop_install_prompt_seen');
    const isInstalled = localStorage.getItem('trashdrop_app_installed') === 'true';
    
    if (hasSeenPrompt || isInstalled) {
      return;
    }

    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(iOS);

    // For iOS, show prompt immediately (no beforeinstallprompt event)
    if (iOS) {
      setShowPrompt(true);
      return;
    }

    // For Android/Chrome, listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Also show after a delay if beforeinstallprompt doesn't fire (some browsers)
    const timeoutId = setTimeout(() => {
      if (!deferredPrompt) {
        setShowPrompt(true);
      }
    }, 3000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearTimeout(timeoutId);
    };
  }, [deferredPrompt]);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      setInstalling(true);
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
          localStorage.setItem('trashdrop_app_installed', 'true');
          localStorage.setItem('trashdrop_install_prompt_seen', 'true');
          setShowPrompt(false);
        }
      } catch (error) {
        console.error('Install prompt error:', error);
      } finally {
        setInstalling(false);
        setDeferredPrompt(null);
      }
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem('trashdrop_install_prompt_seen', 'true');
    setShowPrompt(false);
  }, []);

  // Don't render if already installed or prompt shouldn't show
  if (isStandalone || !showPrompt) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-in">
        {/* Header with app icon */}
        <div className="bg-gradient-to-r from-green-500 to-green-600 p-6 text-center">
          <div className="w-20 h-20 bg-white rounded-2xl shadow-lg mx-auto mb-4 flex items-center justify-center">
            <svg className="w-12 h-12 text-green-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l4.59-4.58L18 11l-6 6z"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">Install TrashDrop</h2>
          <p className="text-green-100 mt-1">Get the best experience</p>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="space-y-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/>
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Works Offline</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Access your pickups even without internet</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/>
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Quick Access</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Launch directly from your home screen</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/>
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Push Notifications</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Get notified when your pickup is collected</p>
              </div>
            </div>
          </div>

          {/* iOS-specific instructions */}
          {isIOS && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6">
              <p className="font-medium text-gray-900 dark:text-white mb-3">To install on iOS:</p>
              <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  Tap the <span className="inline-flex items-center px-1">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16 5l-1.42 1.42-1.59-1.59V16h-2V4.83L9.41 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V10c0-1.11.9-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z"/>
                    </svg>
                  </span> Share button
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  Scroll and tap "Add to Home Screen"
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                  Tap "Add" to confirm
                </li>
              </ol>
            </div>
          )}

          {/* Buttons */}
          <div className="space-y-3">
            {!isIOS && deferredPrompt && (
              <button
                onClick={handleInstall}
                disabled={installing}
                className="w-full py-3 px-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {installing ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                    Installing...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
                    </svg>
                    Install App
                  </>
                )}
              </button>
            )}
            
            <button
              onClick={handleDismiss}
              className="w-full py-3 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
            >
              {isIOS ? "I'll do it later" : (deferredPrompt ? "Maybe Later" : "Continue to App")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForceInstallPrompt;
