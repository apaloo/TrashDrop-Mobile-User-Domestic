/**
 * Toast Notification Utility
 * Provides non-blocking toast notifications for real-time tracking updates
 */

let toastContainer = null;

// Initialize toast container on first use
const initToastContainer = () => {
  if (toastContainer) return toastContainer;
  
  toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'fixed top-24 right-4 z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
};

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - Type of notification: 'info', 'success', 'warning', 'error'
 * @param {number} duration - Duration in milliseconds (default: 4000)
 */
export const showToast = (message, type = 'info', duration = 4000) => {
  const container = initToastContainer();
  
  const toast = document.createElement('div');
  toast.className = `
    pointer-events-auto
    transform transition-all duration-300 ease-in-out
    translate-x-full opacity-0
    bg-white dark:bg-gray-800 
    rounded-lg shadow-2xl 
    p-4 flex items-start space-x-3
    border-l-4
    ${type === 'info' ? 'border-blue-500' : ''}
    ${type === 'success' ? 'border-green-500' : ''}
    ${type === 'warning' ? 'border-yellow-500' : ''}
    ${type === 'error' ? 'border-red-500' : ''}
  `.trim().replace(/\s+/g, ' ');
  
  // Icon based on type
  const iconColors = {
    info: 'text-blue-500',
    success: 'text-green-500',
    warning: 'text-yellow-500',
    error: 'text-red-500'
  };
  
  const icons = {
    info: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />',
    success: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />',
    warning: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />',
    error: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />'
  };
  
  toast.innerHTML = `
    <div class="flex-shrink-0">
      <svg class="w-6 h-6 ${iconColors[type]}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        ${icons[type]}
      </svg>
    </div>
    <div class="flex-1">
      <p class="text-sm font-medium text-gray-900 dark:text-white">${message}</p>
    </div>
    <button class="flex-shrink-0 ml-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  `;
  
  // Add close button functionality
  const closeButton = toast.querySelector('button');
  closeButton.addEventListener('click', () => {
    removeToast(toast);
  });
  
  // Add to container
  container.appendChild(toast);
  
  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.remove('translate-x-full', 'opacity-0');
    toast.classList.add('translate-x-0', 'opacity-100');
  });
  
  // Auto-remove after duration
  if (duration > 0) {
    setTimeout(() => {
      removeToast(toast);
    }, duration);
  }
  
  return toast;
};

/**
 * Remove a toast notification
 */
const removeToast = (toast) => {
  toast.classList.add('translate-x-full', 'opacity-0');
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
};

/**
 * Show collector distance notification
 */
export const showDistanceAlert = (distance, eta) => {
  if (distance < 0.05) {
    showToast(`🎯 Collector has arrived at your location!`, 'success', 5000);
  } else if (distance < 0.2) {
    showToast(`📍 Collector is very close (${Math.round(distance * 1000)}m away)`, 'info', 4000);
  } else if (distance < 1) {
    showToast(`🚚 Collector is nearby (${distance.toFixed(1)} km away)`, 'info', 4000);
  } else if (distance < 2) {
    showToast(`🚛 Collector is approaching - ETA ${eta} minutes`, 'info', 4000);
  }
};

/**
 * Show status change notification
 */
export const showStatusNotification = (oldStatus, newStatus, collectorName = 'Collector') => {
  const statusMessages = {
    accepted: `✅ ${collectorName} accepted your pickup request`,
    en_route: `🚗 ${collectorName} is on the way`,
    in_transit: `🚗 ${collectorName} is on the way`,
    arrived: `🎯 ${collectorName} has arrived at your location`,
    collecting: `♻️ ${collectorName} is collecting your waste`,
    completed: `✨ Pickup completed! Thank you for using TrashDrops`
  };
  
  const message = statusMessages[newStatus] || `Status updated to ${newStatus}`;
  const type = newStatus === 'completed' ? 'success' : 'info';
  
  showToast(message, type, 6000);
};

/**
 * Clear all toasts
 */
export const clearAllToasts = () => {
  if (toastContainer) {
    toastContainer.innerHTML = '';
  }
};

export default {
  showToast,
  showDistanceAlert,
  showStatusNotification,
  clearAllToasts
};
