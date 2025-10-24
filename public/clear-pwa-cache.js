/**
 * Clear PWA cache and force fresh installation
 * This script runs before the app loads to clear old cached data
 */
(function() {
  console.log('[PWA Cache Clear] Starting cache cleanup...');
  
  // Clear all caches
  if ('caches' in window) {
    caches.keys().then(function(names) {
      if (names.length > 0) {
        console.log('[PWA Cache Clear] Found ' + names.length + ' caches to delete');
        names.forEach(function(name) {
          console.log('[PWA Cache Clear] Deleting cache: ' + name);
          caches.delete(name);
        });
      } else {
        console.log('[PWA Cache Clear] No caches found to delete');
      }
    }).catch(function(err) {
      console.error('[PWA Cache Clear] Error deleting caches:', err);
    });
  }
  
  // Unregister all service workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      if (registrations.length > 0) {
        console.log('[PWA Cache Clear] Found ' + registrations.length + ' service workers to unregister');
        registrations.forEach(function(registration) {
          console.log('[PWA Cache Clear] Unregistering service worker');
          registration.unregister();
        });
      } else {
        console.log('[PWA Cache Clear] No service workers found to unregister');
      }
    }).catch(function(err) {
      console.error('[PWA Cache Clear] Error unregistering service workers:', err);
    });
  }
  
  // Clear localStorage items related to old app versions
  try {
    var keysToCheck = ['trashdrop_version', 'app_version', 'pwa_version'];
    keysToCheck.forEach(function(key) {
      if (localStorage.getItem(key)) {
        console.log('[PWA Cache Clear] Removing old version key: ' + key);
        localStorage.removeItem(key);
      }
    });
    
    // Set current version
    localStorage.setItem('trashdrop_version', '2.0.0');
    console.log('[PWA Cache Clear] Set current app version to 2.0.0');
  } catch (e) {
    console.error('[PWA Cache Clear] Error clearing localStorage:', e);
  }
  
  console.log('[PWA Cache Clear] Cache cleanup complete');
})();
