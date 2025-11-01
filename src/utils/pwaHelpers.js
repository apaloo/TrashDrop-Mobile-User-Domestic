/**
 * PWA Helper functions for TrashDrop
 * These utilities help ensure proper PWA functionality
 */

/**
 * Detect if the app is running in standalone/PWA mode
 * @returns {boolean} True if running as PWA
 */
export const isPwaMode = () => {
  return (
    window.matchMedia('(display-mode: standalone)').matches || 
    window.navigator.standalone === true
  );
};

/**
 * Store authentication data in localStorage with PWA-specific flags
 * @param {Object} user - User object
 * @param {Object} session - Session object with access_token
 * @param {string} tokenKey - Key to use for token storage
 * @param {string} userKey - Key to use for user storage
 */
export const storePwaAuthData = (user, session, tokenKey = 'trashdrop_auth_token', userKey = 'trashdrop_user') => {
  try {
    if (\!user || \!session?.access_token) {
      console.error('[PWA] Cannot store auth data - missing user or token');
      return false;
    }

    // Store user data with PWA flag
    const userData = {
      ...user,
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata,
      last_authenticated: new Date().toISOString(),
      pwa_authenticated: true // Add PWA flag
    };
    
    localStorage.setItem(userKey, JSON.stringify(userData));
    localStorage.setItem(tokenKey, session.access_token);
    
    // Store additional PWA metadata
    localStorage.setItem('trashdrop_pwa_last_login', new Date().toISOString());
    
    console.log('[PWA] Auth data stored successfully');
    return true;
  } catch (error) {
    console.error('[PWA] Error storing auth data:', error);
    return false;
  }
};

/**
 * Get stored PWA authentication data
 * @param {string} tokenKey - Key used for token storage
 * @param {string} userKey - Key used for user storage
 * @returns {Object|null} Object with user and token, or null if not found
 */
export const getPwaAuthData = (tokenKey = 'trashdrop_auth_token', userKey = 'trashdrop_user') => {
  try {
    const storedUserJson = localStorage.getItem(userKey);
    const storedToken = localStorage.getItem(tokenKey);
    
    if (\!storedUserJson || \!storedToken || storedToken === 'undefined' || storedToken === 'null') {
      return null;
    }
    
    const storedUser = JSON.parse(storedUserJson);
    
    return {
      user: storedUser,
      token: storedToken,
      isPwaAuthenticated: \!\!storedUser.pwa_authenticated
    };
  } catch (error) {
    console.error('[PWA] Error retrieving auth data:', error);
    return null;
  }
};

/**
 * Clear PWA authentication data
 * @param {string} tokenKey - Key used for token storage
 * @param {string} userKey - Key used for user storage
 */
export const clearPwaAuthData = (tokenKey = 'trashdrop_auth_token', userKey = 'trashdrop_user') => {
  try {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    localStorage.removeItem('trashdrop_pwa_last_login');
    
    // Also clear any Supabase-related items
    const supabaseKeys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
      .filter(key => key && (key.includes('supabase') || key.includes('sb-')));
    
    supabaseKeys.forEach(key => {
      if (key) localStorage.removeItem(key);
    });
    
    console.log('[PWA] Auth data cleared successfully');
    return true;
  } catch (error) {
    console.error('[PWA] Error clearing auth data:', error);
    return false;
  }
};

export default {
  isPwaMode,
  storePwaAuthData,
  getPwaAuthData,
  clearPwaAuthData
};
