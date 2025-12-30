/**
 * Error logging utility for TrashDrops application
 * Provides centralized error logging with categorization and optional reporting
 */

// Error categories for better filtering and handling
export const ERROR_CATEGORIES = {
  AUTH: 'authentication',
  NETWORK: 'network',
  DATA: 'data',
  UI: 'user_interface',
  GEOLOCATION: 'geolocation',
  SERVICE_WORKER: 'service_worker',
  UNKNOWN: 'unknown'
};

/**
 * Log an error with appropriate categorization and context
 * @param {Error|string} error - The error object or message
 * @param {string} category - Error category from ERROR_CATEGORIES
 * @param {Object} context - Additional contextual information
 * @param {boolean} isFatal - Whether this is a fatal/critical error
 */
export const logError = (error, category = ERROR_CATEGORIES.UNKNOWN, context = {}, isFatal = false) => {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : error;
  const stack = error instanceof Error ? error.stack : new Error().stack;
  
  // Build structured error object
  const errorLog = {
    timestamp,
    category,
    message: errorMessage,
    stack,
    context,
    isFatal
  };
  
  // Always log to console
  if (isFatal) {
    console.error(`[FATAL ERROR][${category}]`, errorLog);
  } else {
    console.warn(`[ERROR][${category}]`, errorLog);
  }
  
  // Store in session for potential reporting
  storeErrorInSession(errorLog);
  
  // Additional handling for critical errors
  if (isFatal) {
    handleFatalError(errorLog);
  }
  
  return errorLog;
};

/**
 * Log authentication specific errors with appropriate context
 * @param {Error|string} error - The error object or message
 * @param {string} action - The authentication action being performed
 * @param {Object} additionalContext - Any additional context
 */
export const logAuthError = (error, action, additionalContext = {}) => {
  const context = {
    action,
    isOnline: navigator.onLine,
    ...additionalContext
  };
  
  return logError(error, ERROR_CATEGORIES.AUTH, context);
};

/**
 * Store error in session for potential reporting or analytics
 * @param {Object} errorLog - The error log object
 */
const storeErrorInSession = (errorLog) => {
  try {
    // Get existing errors or initialize new array
    const existingErrors = JSON.parse(sessionStorage.getItem('error_logs') || '[]');
    
    // Add new error (limit to prevent memory issues)
    const MAX_STORED_ERRORS = 50;
    if (existingErrors.length >= MAX_STORED_ERRORS) {
      existingErrors.shift(); // Remove oldest error
    }
    existingErrors.push(errorLog);
    
    // Store back in session storage
    sessionStorage.setItem('error_logs', JSON.stringify(existingErrors));
  } catch (e) {
    console.error('Failed to store error in session:', e);
  }
};

/**
 * Handle fatal errors that require immediate attention
 * @param {Object} errorLog - The error log object
 */
const handleFatalError = (errorLog) => {
  // Could be extended with error reporting to a service
  // or triggering app-wide error boundaries
  
  // For now, just ensure it's prominently logged
  console.error('%c FATAL ERROR DETECTED! ', 'background: #ff0000; color: white; font-size: 16px;');
  console.error(errorLog);
};

/**
 * Get all stored error logs from this session
 * @returns {Array} Array of error log objects
 */
export const getStoredErrors = () => {
  try {
    return JSON.parse(sessionStorage.getItem('error_logs') || '[]');
  } catch (e) {
    console.error('Failed to retrieve stored errors:', e);
    return [];
  }
};

/**
 * Clear all stored error logs
 */
export const clearStoredErrors = () => {
  try {
    sessionStorage.removeItem('error_logs');
  } catch (e) {
    console.error('Failed to clear stored errors:', e);
  }
};

export default {
  logError,
  logAuthError,
  getStoredErrors,
  clearStoredErrors,
  ERROR_CATEGORIES
};
