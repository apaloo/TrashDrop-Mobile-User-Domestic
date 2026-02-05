/**
 * Debug utility for gated console logging
 * Logs are only shown when DEBUG mode is enabled
 */

const DEBUG = process.env.NODE_ENV === 'development' || 
              process.env.REACT_APP_DEBUG === 'true' ||
              localStorage.getItem('trashdrop_debug') === 'true';

const debug = {
  log: (...args) => {
    if (DEBUG) console.log(...args);
  },
  
  warn: (...args) => {
    if (DEBUG) console.warn(...args);
  },
  
  error: (...args) => {
    // Always show errors
    console.error(...args);
  },
  
  info: (...args) => {
    if (DEBUG) console.info(...args);
  },
  
  group: (label) => {
    if (DEBUG) console.group(label);
  },
  
  groupEnd: () => {
    if (DEBUG) console.groupEnd();
  },
  
  table: (data) => {
    if (DEBUG) console.table(data);
  },
  
  // Enable/disable debug mode at runtime
  enable: () => {
    localStorage.setItem('trashdrop_debug', 'true');
    console.log('[Debug] Debug mode enabled. Refresh to see all logs.');
  },
  
  disable: () => {
    localStorage.removeItem('trashdrop_debug');
    console.log('[Debug] Debug mode disabled. Refresh to hide debug logs.');
  },
  
  isEnabled: () => DEBUG
};

// Expose to window for runtime toggling
if (typeof window !== 'undefined') {
  window.trashdropDebug = debug;
}

export default debug;
