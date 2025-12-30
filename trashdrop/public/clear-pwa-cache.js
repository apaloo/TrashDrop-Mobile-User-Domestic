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
    var currentVersion = '2.0.1-' + Date.now();
    var storedVersion = localStorage.getItem('trashdrop_version');
    
    // If version mismatch, clear everything
    if (storedVersion !== currentVersion) {
      console.log('[PWA Cache Clear] Version mismatch detected. Clearing all app data...');
      console.log('[PWA Cache Clear] Old version:', storedVersion, 'New version:', currentVersion);
      
      // Clear all trashdrop-related localStorage
      var keys = Object.keys(localStorage);
      keys.forEach(function(key) {
        if (key.indexOf('trashdrop') === 0 || key.indexOf('profile_') === 0) {
          console.log('[PWA Cache Clear] Removing:', key);
          localStorage.removeItem(key);
        }
      });
      
      // Force page reload after clearing
      localStorage.setItem('trashdrop_version', currentVersion);
      localStorage.setItem('force_reload_done', 'true');
      console.log('[PWA Cache Clear] Set current app version to', currentVersion);
      
      // Force hard reload
      if (!sessionStorage.getItem('reload_done')) {
        sessionStorage.setItem('reload_done', 'true');
        console.log('[PWA Cache Clear] Forcing hard reload...');
        window.location.reload(true);
      }
    } else {
      console.log('[PWA Cache Clear] Version match, no clear needed');
    }
  } catch (e) {
    console.error('[PWA Cache Clear] Error clearing localStorage:', e);
  }
  
  console.log('[PWA Cache Clear] Cache cleanup complete');
})();
