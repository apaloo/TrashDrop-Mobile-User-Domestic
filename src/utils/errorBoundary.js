/**
 * Global error handling utilities for TrashDrop
 * Helps catch and log errors that might cause blank screens
 */

/**
 * Initialize global error handlers
 * This should be called early in the application lifecycle
 */
export const initGlobalErrorHandlers = () => {
  // Save original console.error
  const originalConsoleError = console.error;
  
  // Override console.error to provide more context
  console.error = (...args) => {
    // Call original console.error
    originalConsoleError.apply(console, args);
    
    // Log to localStorage for debugging PWA issues
    try {
      const errorLogs = JSON.parse(localStorage.getItem('trashdrop_error_logs') || '[]');
      errorLogs.push({
        timestamp: new Date().toISOString(),
        message: args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' '),
        url: window.location.href
      });
      
      // Keep only the last 20 errors
      if (errorLogs.length > 20) {
        errorLogs.shift();
      }
      
      localStorage.setItem('trashdrop_error_logs', JSON.stringify(errorLogs));
    } catch (e) {
      // Ignore errors in error handler
    }
  };
  
  // Add global error handler
  window.addEventListener('error', (event) => {
    try {
      const errorLogs = JSON.parse(localStorage.getItem('trashdrop_error_logs') || '[]');
      errorLogs.push({
        timestamp: new Date().toISOString(),
        type: 'uncaught_error',
        message: event.message,
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        url: window.location.href
      });
      
      // Keep only the last 20 errors
      if (errorLogs.length > 20) {
        errorLogs.shift();
      }
      
      localStorage.setItem('trashdrop_error_logs', JSON.stringify(errorLogs));
      
      // Display error overlay in PWA mode
      if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'fixed';
        errorDiv.style.bottom = '0';
        errorDiv.style.left = '0';
        errorDiv.style.right = '0';
        errorDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
        errorDiv.style.color = 'white';
        errorDiv.style.padding = '10px';
        errorDiv.style.zIndex = '9999';
        errorDiv.style.fontSize = '12px';
        errorDiv.style.fontFamily = 'monospace';
        errorDiv.textContent = `Error: ${event.message} (${event.filename}:${event.lineno})`;
        document.body.appendChild(errorDiv);
      }
    } catch (e) {
      // Ignore errors in error handler
    }
  });
  
  // Add unhandled promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    try {
      const errorLogs = JSON.parse(localStorage.getItem('trashdrop_error_logs') || '[]');
      errorLogs.push({
        timestamp: new Date().toISOString(),
        type: 'unhandled_promise_rejection',
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        url: window.location.href
      });
      
      // Keep only the last 20 errors
      if (errorLogs.length > 20) {
        errorLogs.shift();
      }
      
      localStorage.setItem('trashdrop_error_logs', JSON.stringify(errorLogs));
    } catch (e) {
      // Ignore errors in error handler
    }
  });
  
  console.log('[ErrorHandlers] Global error handlers initialized');
};

/**
 * Get error logs from localStorage
 * @returns {Array} Array of error logs
 */
export const getErrorLogs = () => {
  try {
    return JSON.parse(localStorage.getItem('trashdrop_error_logs') || '[]');
  } catch (e) {
    return [];
  }
};

/**
 * Clear error logs from localStorage
 */
export const clearErrorLogs = () => {
  localStorage.removeItem('trashdrop_error_logs');
};

export default {
  initGlobalErrorHandlers,
  getErrorLogs,
  clearErrorLogs
};
