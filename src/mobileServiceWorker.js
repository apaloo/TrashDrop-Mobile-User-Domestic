/**
 * Mobile-specific service worker registration
 * This file handles service worker registration specifically for mobile devices
 */

// Check if the device is mobile
const isMobileDevice = () => {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
};

// Register the service worker
export function register(config) {
  if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
    // The URL constructor is available in all browsers that support SW
    const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);
    
    // Our service worker won't work if PUBLIC_URL is on a different origin
    if (publicUrl.origin \!== window.location.origin) {
      console.log('[MobileSW] Different origin, skipping service worker registration');
      return;
    }

    // Mobile-specific registration
    if (isMobileDevice()) {
      console.log('[MobileSW] Mobile device detected, registering service worker');
      
      window.addEventListener('load', () => {
        const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;
        
        // Register the service worker
        navigator.serviceWorker
          .register(swUrl)
          .then(registration => {
            console.log('[MobileSW] Service worker registered successfully');
            
            // Check for updates
            registration.onupdatefound = () => {
              const installingWorker = registration.installing;
              if (\!installingWorker) return;
              
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    // New content is available
                    console.log('[MobileSW] New content available, refresh needed');
                    
                    // Show update notification for mobile
                    if (config && config.onUpdate) {
                      config.onUpdate(registration);
                    } else {
                      // Default update notification
                      const updateNotification = document.createElement('div');
                      updateNotification.style.position = 'fixed';
                      updateNotification.style.bottom = '0';
                      updateNotification.style.left = '0';
                      updateNotification.style.right = '0';
                      updateNotification.style.backgroundColor = '#4CAF50';
                      updateNotification.style.color = 'white';
                      updateNotification.style.padding = '10px';
                      updateNotification.style.textAlign = 'center';
                      updateNotification.style.zIndex = '9999';
                      updateNotification.innerHTML = 'New version available\! <button style="background: white; color: #4CAF50; border: none; padding: 5px 10px; border-radius: 3px; margin-left: 10px;">Refresh</button>';
                      
                      // Add click handler
                      updateNotification.querySelector('button').addEventListener('click', () => {
                        window.location.reload();
                      });
                      
                      document.body.appendChild(updateNotification);
                    }
                  } else {
                    // Content is cached for offline use
                    console.log('[MobileSW] Content cached for offline use');
                    
                    if (config && config.onSuccess) {
                      config.onSuccess(registration);
                    }
                  }
                }
              };
            };
          })
          .catch(error => {
            console.error('[MobileSW] Error during service worker registration:', error);
          });
      });
    } else {
      console.log('[MobileSW] Not a mobile device, skipping mobile-specific registration');
    }
  }
}

// Unregister the service worker
export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then(registration => {
        registration.unregister();
      })
      .catch(error => {
        console.error(error.message);
      });
  }
}
