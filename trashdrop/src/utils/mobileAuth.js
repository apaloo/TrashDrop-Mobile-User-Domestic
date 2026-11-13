/**
 * Mobile-specific authentication utilities for TrashDrop
 * These utilities help ensure proper authentication in mobile PWA environments
 */

/**
 * Detect if the app is running in a mobile environment
 * @returns {boolean} True if running on a mobile device
 */
export const isMobileDevice = () => {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
};

/**
 * Detect if the app is running as a PWA on a mobile device
 * @returns {boolean} True if running as a mobile PWA
 */
export const isMobilePwa = () => {
  const isPwa = window.matchMedia('(display-mode: standalone)').matches || 
                window.navigator.standalone === true;
  return isPwa && isMobileDevice();
};

/**
 * Get stored authentication data with mobile-specific fallbacks
 * @param {string} tokenKey - Key used for token storage
 * @param {string} userKey - Key used for user storage
 * @returns {Object|null} Object with user and token, or null if not found
 */
export const getMobileAuthData = (tokenKey = "trashdrop_auth_token", userKey = "trashdrop_user") => {
  try {
    // Try localStorage first
    let storedUserJson = localStorage.getItem(userKey);
    let storedToken = localStorage.getItem(tokenKey);
    
    // If not found in localStorage, try sessionStorage (mobile fallback)
    if ((!storedUserJson || !storedToken) && isMobileDevice()) {
      storedUserJson = sessionStorage.getItem(userKey);
      storedToken = sessionStorage.getItem(tokenKey);
    }
    
    if (!storedUserJson || !storedToken || storedToken === "undefined" || storedToken === "null") {
      return null;
    }
    
    const storedUser = JSON.parse(storedUserJson);
    
    return {
      user: storedUser,
      token: storedToken,
      isMobileAuthenticated: !!storedUser.mobile_authenticated,
      deviceType: storedUser.device_type || 'unknown'
    };
  } catch (error) {
    console.error('[MobileAuth] Error retrieving auth data:', error);
    return null;
  }
};

/**
 * Initialize mobile-specific auth listeners
 * This helps maintain auth state across app refreshes and restarts
 */
export const initMobileAuthListeners = () => {
  if (!isMobileDevice()) return;
  
  console.log('[MobileAuth] Initializing mobile auth listeners');
  
  // Listen for visibility changes (app coming to foreground)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('[MobileAuth] App became visible, checking auth state');
      const authData = getMobileAuthData();
      if (authData) {
        console.log('[MobileAuth] Found stored credentials on visibility change');
      }
    }
  });
  
  // Listen for online/offline events
  window.addEventListener('online', () => {
    console.log('[MobileAuth] Device came online, refreshing auth state');
    const authData = getMobileAuthData();
    if (authData) {
      console.log('[MobileAuth] Found stored credentials on online event');
    }
  });
  
  // Set up periodic auth check for mobile PWA
  if (isMobilePwa()) {
    setInterval(() => {
      const authData = getMobileAuthData();
      if (authData) {
        console.log('[MobileAuth] Periodic auth check: authenticated');
      } else {
        console.log('[MobileAuth] Periodic auth check: not authenticated');
      }
    }, 30000); // Check every 30 seconds
  }
};

export default {
  isMobileDevice,
  isMobilePwa,
  getMobileAuthData,
  initMobileAuthListeners
};
