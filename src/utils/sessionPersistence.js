/**
 * Session persistence utilities
 * Helps maintain authentication state across page refreshes and bookmarks
 */

// Key for storing the last visited path
const LAST_PATH_KEY = 'trashdrop_last_path';

// Keys for authentication data
const USER_KEY = 'trashdrop_user';
const TOKEN_KEY = 'trashdrop_auth_token';

/**
 * Store the current path for restoration after refresh
 * @param {string} path - Current path to store
 */
export const storeCurrentPath = (path) => {
  try {
    if (path && typeof path === 'string') {
      sessionStorage.setItem(LAST_PATH_KEY, path);
      console.log('[SessionPersistence] Stored path:', path);
    }
  } catch (error) {
    console.error('[SessionPersistence] Failed to store path:', error);
  }
};

/**
 * Get the last stored path
 * @returns {string|null} The last stored path or null if not found
 */
export const getLastPath = () => {
  try {
    return sessionStorage.getItem(LAST_PATH_KEY);
  } catch (error) {
    console.error('[SessionPersistence] Failed to get last path:', error);
    return null;
  }
};

/**
 * Check if user has stored credentials
 * @returns {boolean} True if user has stored credentials
 */
export const hasStoredCredentials = () => {
  try {
    const hasUser = !!localStorage.getItem(USER_KEY);
    const hasToken = !!localStorage.getItem(TOKEN_KEY);
    return hasUser && hasToken;
  } catch (error) {
    console.error('[SessionPersistence] Failed to check stored credentials:', error);
    return false;
  }
};

/**
 * Get stored user data
 * @returns {Object|null} Parsed user data or null if not found
 */
export const getStoredUser = () => {
  try {
    const userData = localStorage.getItem(USER_KEY);
    return userData ? JSON.parse(userData) : null;
  } catch (error) {
    console.error('[SessionPersistence] Failed to get stored user:', error);
    return null;
  }
};

/**
 * Get stored token
 * @returns {string|null} The stored token or null if not found
 */
export const getStoredToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (error) {
    console.error('[SessionPersistence] Failed to get stored token:', error);
    return null;
  }
};

export default {
  storeCurrentPath,
  getLastPath,
  hasStoredCredentials,
  getStoredUser,
  getStoredToken,
  LAST_PATH_KEY,
  USER_KEY,
  TOKEN_KEY
};
