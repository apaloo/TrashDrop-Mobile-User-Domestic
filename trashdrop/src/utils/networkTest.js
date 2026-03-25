/**
 * Network Test Utility - For testing network status ribbon
 * This utility helps simulate network connectivity changes for testing
 */

// Function to simulate going offline (for testing)
export const simulateOffline = () => {
  console.log('[NetworkTest] Simulating offline mode');
  // Dispatch offline event to trigger network status changes
  window.dispatchEvent(new Event('offline'));
};

// Function to simulate coming online (for testing)
export const simulateOnline = () => {
  console.log('[NetworkTest] Simulating online mode');
  // Dispatch online event to trigger network status changes
  window.dispatchEvent(new Event('online'));
};

// Function to check current network status
export const checkNetworkStatus = () => {
  return {
    isOnline: navigator.onLine,
    connectionType: navigator.connection?.effectiveType || 'unknown',
    downlink: navigator.connection?.downlink || 'unknown',
    rtt: navigator.connection?.rtt || 'unknown'
  };
};

// Add to window for easy access in browser console during development
if (process.env.NODE_ENV === 'development') {
  window.simulateOffline = simulateOffline;
  window.simulateOnline = simulateOnline;
  window.checkNetworkStatus = checkNetworkStatus;
  
  console.log('[NetworkTest] Network testing utilities available in console:');
  console.log('- simulateOffline() - Simulate going offline');
  console.log('- simulateOnline() - Simulate coming online');
  console.log('- checkNetworkStatus() - Check current network status');
}
