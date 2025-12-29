/**
 * Clear all cached and mock data from localStorage
 * This script clears:
 * - Test account data
 * - Mock/cached authentication tokens
 * - Development mode flags
 * - Any stale session data
 */

(function() {
  console.log('[Clear Cache] Starting cache cleanup...');
  
  try {
    // Clear all localStorage
    localStorage.clear();
    console.log('[Clear Cache] localStorage cleared');
    
    // Clear all sessionStorage
    sessionStorage.clear();
    console.log('[Clear Cache] sessionStorage cleared');
    
    // Clear all cookies
    document.cookie.split(';').forEach(function(c) {
      document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    });
    console.log('[Clear Cache] Cookies cleared');
    
    // Clear any IndexedDB databases (for PWA caching)
    if (window.indexedDB) {
      indexedDB.databases().then(function(databases) {
        databases.forEach(function(db) {
          console.log('[Clear Cache] Deleting IndexedDB:', db.name);
          indexedDB.deleteDatabase(db.name);
        });
      }).catch(function(err) {
        console.warn('[Clear Cache] Could not enumerate IndexedDB databases:', err);
      });
    }
    
    console.log('[Clear Cache] ✅ All cached data cleared successfully');
    console.log('[Clear Cache] Please log in with real Supabase credentials');
    
  } catch (error) {
    console.error('[Clear Cache] Error during cleanup:', error);
  }
})();
