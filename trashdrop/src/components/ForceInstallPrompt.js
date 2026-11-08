import React, { useState, useEffect, useCallback, useRef } from 'react';

const INSTALLED_KEY = 'trashdrop_app_installed';
// How long a tap waits for the browser to say it can install. The tap only
// stays valid for the install dialog for about five seconds.
const INSTALL_READY_WAIT_MS = 3000;

const BENEFITS = [
  { title: 'Works Offline', detail: 'Use the app even without internet' },
  { title: 'Quick Access', detail: 'Launch directly from your home screen' },
  { title: 'Push Notifications', detail: 'Get notified when your pickup is collected' },
];

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true ||
  document.referrer.includes('android-app://');

/**
 * Full-screen install screen, shown on every visit in a browser until the app
 * is installed.
 *
 * Tapping install opens the browser's own install dialog wherever the browser
 * offers one. Where it doesn't, the steps to install by hand replace the
 * benefits list, so the tap always visibly does something.
 *
 * The buttons sit outside the scrolling area so they stay on screen on short
 * phones.
 */
const ForceInstallPrompt = () => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isAndroid = /Android/.test(navigator.userAgent);

  const [showPrompt, setShowPrompt] = useState(() => {
    if (isStandalone()) {
      localStorage.setItem(INSTALLED_KEY, 'true');
      return false;
    }
    return localStorage.getItem(INSTALLED_KEY) !== 'true';
  });
  // iOS has no install dialog, so its steps are the way to install
  const [showManualSteps, setShowManualSteps] = useState(isIOS);
  const [isInstalling, setIsInstalling] = useState(false);
  const deferredPromptRef = useRef(null);
  const installReadyRef = useRef(null);

  useEffect(() => {
    const handleInstallOffer = (e) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      installReadyRef.current?.();
    };
    const handleInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, 'true');
      setShowPrompt(false);
    };
    window.addEventListener('beforeinstallprompt', handleInstallOffer);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallOffer);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    setIsInstalling(true);
    try {
      // The browser can announce it's ready a moment after this screen appears
      if (!deferredPromptRef.current) {
        await new Promise((resolve) => {
          installReadyRef.current = resolve;
          setTimeout(resolve, INSTALL_READY_WAIT_MS);
        });
        installReadyRef.current = null;
      }

      const installOffer = deferredPromptRef.current;
      if (!installOffer) {
        setShowManualSteps(true);
        return;
      }

      deferredPromptRef.current = null;
      await installOffer.prompt();
      const { outcome } = await installOffer.userChoice;
      if (outcome === 'accepted') {
        localStorage.setItem(INSTALLED_KEY, 'true');
        setShowPrompt(false);
      }
    } catch (error) {
      console.error('Install prompt error:', error);
      setShowManualSteps(true);
    } finally {
      setIsInstalling(false);
    }
  }, []);

  // Use it in the browser this time. Asks again on the next visit.
  const handleSkip = useCallback(() => setShowPrompt(false), []);

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 h-[100dvh] z-[9999] bg-gradient-to-b from-green-600 to-green-800 flex flex-col">
      <div data-testid="install-scroll" className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="min-h-full flex flex-col items-center justify-center p-6">
          <div className="w-20 h-20 bg-white rounded-2xl shadow-lg mb-4 flex items-center justify-center">
            <img src="/logo.svg" alt="TrashDrop logo" className="w-14 h-14 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-6">TrashDrop</h1>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center mb-2">Install TrashDrop</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-5">
              Add TrashDrop to your phone to book pickups and track them in one tap.
            </p>

            {!showManualSteps ? (
              <div className="space-y-4">
                {BENEFITS.map(({ title, detail }) => (
                  <div key={title} className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" clipRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{title}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                <p className="font-medium text-gray-900 dark:text-white mb-3">To install:</p>
                <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-300 list-decimal list-inside">
                  {isIOS ? (
                    <>
                      <li>Tap the <strong>Share</strong> button in your browser</li>
                      <li>Scroll and tap <strong>"Add to Home Screen"</strong></li>
                      <li>Tap <strong>"Add"</strong> to confirm</li>
                    </>
                  ) : isAndroid ? (
                    <>
                      <li>Tap the <strong>⋮</strong> menu in your browser</li>
                      <li>Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong></li>
                      <li>Tap <strong>"Add"</strong> to confirm</li>
                    </>
                  ) : (
                    <>
                      <li>Click the <strong>install icon</strong> in your browser's address bar</li>
                      <li>Or open the browser menu and choose <strong>"Install TrashDrop"</strong></li>
                    </>
                  )}
                </ol>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Always on screen, whatever the phone's height */}
      <div className="shrink-0 bg-white dark:bg-gray-800 rounded-t-2xl px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="space-y-3 max-w-sm mx-auto">
          {!showManualSteps ? (
            <>
              <button
                type="button"
                onClick={handleInstall}
                disabled={isInstalling}
                className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isInstalling ? 'Getting ready…' : isAndroid ? 'Add to Home Screen' : 'Install App'}
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={isInstalling}
                className="w-full py-3 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors text-sm disabled:opacity-50"
              >
                {isAndroid ? 'Open App' : 'Maybe Later'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleSkip}
              className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForceInstallPrompt;
