/**
 * Status Service - Unified status management for pickups and digital bins
 * Implements the consolidated status flow with validation and transitions
 */

// Unified status states with display names and configuration
export const PICKUP_STATES = {
  pending: {
    value: 'pending',
    display: 'Waiting for collector',
    description: 'Your request is waiting for a collector to accept',
    color: '#F59E0B', // amber
    icon: '⏳',
    next: ['accepted', 'cancelled'],
    notifications: { toast: false, alert: false, push: false },
    actions: ['cancel'],
    tracking: false
  },
  accepted: {
    value: 'accepted',
    display: 'Collector assigned',
    description: 'A collector has been assigned to your request',
    color: '#3B82F6', // blue
    icon: '✅',
    next: ['en_route', 'cancelled'],
    notifications: { toast: true, alert: true, push: true },
    actions: ['track', 'cancel'],
    tracking: false,
    showCollectorInfo: true
  },
  en_route: {
    value: 'en_route',
    display: 'On the way',
    description: 'Collector is on the way to your location',
    color: '#10B981', // emerald
    icon: '🚗',
    next: ['arrived', 'cancelled'],
    notifications: { toast: false, alert: true, push: true },
    actions: ['track', 'contact'],
    tracking: true,
    showETA: true
  },
  arrived: {
    value: 'arrived',
    display: 'At location',
    description: 'Collector has arrived at your location',
    color: '#8B5CF6', // purple
    icon: '📍',
    next: ['collecting', 'cancelled'],
    notifications: { toast: false, alert: true, push: true, sound: true },
    actions: ['track', 'contact'],
    tracking: true,
    showContactInfo: true,
    urgent: true
  },
  collecting: {
    value: 'collecting',
    display: 'Collecting waste',
    description: 'Collector is collecting your waste',
    color: '#F97316', // orange
    icon: '♻️',
    next: ['completed', 'cancelled'],
    notifications: { toast: false, alert: true, push: true },
    actions: ['track'],
    tracking: true,
    showProgress: true
  },
  completed: {
    value: 'completed',
    display: 'Service completed',
    description: 'Your waste has been collected successfully',
    color: '#22C55E', // green
    icon: '🎉',
    next: [],
    notifications: { toast: true, alert: true, push: true },
    actions: ['rate', 'receipt'],
    tracking: false,
    showRating: true,
    terminal: true
  },
  cancelled: {
    value: 'cancelled',
    display: 'Cancelled',
    description: 'The request has been cancelled',
    color: '#EF4444', // red
    icon: '❌',
    next: [],
    notifications: { toast: true, alert: true, push: true },
    actions: ['reschedule'],
    tracking: false,
    terminal: true
  }
};

/**
 * Status Service provides unified status management
 */
export const statusService = {
  /**
   * Get status configuration by status value
   * @param {string} status - Status value
   * @returns {Object} Status configuration
   */
  getStatusConfig(status) {
    return PICKUP_STATES[status] || PICKUP_STATES.pending;
  },

  /**
   * Get all available statuses in order
   * @returns {Array} Array of status configurations
   */
  getStatusFlow() {
    return Object.values(PICKUP_STATES);
  },

  /**
   * Get next valid statuses for current status
   * @param {string} currentStatus - Current status
   * @returns {Array} Array of valid next statuses
   */
  getNextStatuses(currentStatus) {
    const config = this.getStatusConfig(currentStatus);
    return config.next || [];
  },

  /**
   * Validate if a status transition is allowed
   * @param {string} fromStatus - Current status
   * @param {string} toStatus - Target status
   * @returns {boolean} Whether transition is valid
   */
  isValidTransition(fromStatus, toStatus) {
    const nextStatuses = this.getNextStatuses(fromStatus);
    return nextStatuses.includes(toStatus);
  },

  /**
   * Get progress percentage for status (for progress bars)
   * @param {string} status - Current status
   * @returns {number} Progress percentage (0-100)
   */
  getProgressPercentage(status) {
    const statusOrder = ['pending', 'accepted', 'en_route', 'arrived', 'collecting', 'completed'];
    const currentIndex = statusOrder.indexOf(status);
    
    if (status === 'cancelled') return 0;
    if (currentIndex === -1) return 0;
    
    return Math.round(((currentIndex + 1) / statusOrder.length) * 100);
  },

  /**
   * Get notification strategy for status
   * @param {string} status - Status value
   * @returns {Object} Notification configuration
   */
  getNotificationStrategy(status) {
    const config = this.getStatusConfig(status);
    return config.notifications || { toast: false, alert: false, push: false };
  },

  /**
   * Get available actions for status
   * @param {string} status - Status value
   * @returns {Array} Array of available actions
   */
  getAvailableActions(status) {
    const config = this.getStatusConfig(status);
    return config.actions || [];
  },

  /**
   * Check if tracking should be available for status
   * @param {string} status - Status value
   * @returns {boolean} Whether tracking is available
   */
  isTrackingAvailable(status) {
    const config = this.getStatusConfig(status);
    return config.tracking || false;
  },

  /**
   * Check if status is terminal (no further transitions)
   * @param {string} status - Status value
   * @returns {boolean} Whether status is terminal
   */
  isTerminalStatus(status) {
    const config = this.getStatusConfig(status);
    return config.terminal || false;
  },

  /**
   * Get status color for UI display
   * @param {string} status - Status value
   * @returns {string} Color hex code
   */
  getStatusColor(status) {
    const config = this.getStatusConfig(status);
    return config.color || '#6B7280';
  },

  /**
   * Get status icon for UI display
   * @param {string} status - Status value
   * @returns {string} Icon character or emoji
   */
  getStatusIcon(status) {
    const config = this.getStatusConfig(status);
    return config.icon || '📋';
  },

  /**
   * Get status display name
   * @param {string} status - Status value
   * @returns {string} Human-readable display name
   */
  getStatusDisplay(status) {
    const config = this.getStatusConfig(status);
    return config.display || 'Unknown';
  },

  /**
   * Get status description
   * @param {string} status - Status value
   * @returns {string} Status description
   */
  getStatusDescription(status) {
    const config = this.getStatusConfig(status);
    return config.description || '';
  },

  /**
   * Create status change event for tracking
   * @param {Object} params - Status change parameters
   * @returns {Object} Status change event
   */
  createStatusChangeEvent({ pickupId, requestType, oldStatus, newStatus, userId, collectorId }) {
    return {
      id: `status_change_${pickupId}_${Date.now()}`,
      pickupId,
      requestType,
      oldStatus,
      newStatus,
      userId,
      collectorId,
      timestamp: new Date().toISOString(),
      config: this.getStatusConfig(newStatus),
      isValidTransition: this.isValidTransition(oldStatus, newStatus),
      progress: this.getProgressPercentage(newStatus),
      trackingAvailable: this.isTrackingAvailable(newStatus),
      notifications: this.getNotificationStrategy(newStatus),
      actions: this.getAvailableActions(newStatus)
    };
  },

  /**
   * Get status flow for progress tracking
   * @param {string} currentStatus - Current status
   * @returns {Array} Array of status steps with completion info
   */
  getProgressFlow(currentStatus) {
    const statusOrder = ['pending', 'accepted', 'en_route', 'arrived', 'collecting', 'completed'];
    const currentIndex = statusOrder.indexOf(currentStatus);
    
    return statusOrder.map((status, index) => {
      const config = this.getStatusConfig(status);
      return {
        status,
        display: config.display,
        icon: config.icon,
        color: config.color,
        completed: index < currentIndex,
        current: index === currentIndex,
        upcoming: index > currentIndex,
        description: config.description
      };
    });
  },

  /**
   * Get recommended actions based on status and context
   * @param {string} status - Current status
   * @param {Object} context - Additional context (userRole, etc.)
   * @returns {Array} Array of recommended actions
   */
  getRecommendedActions(status, context = {}) {
    const baseActions = this.getAvailableActions(status);
    const { userRole = 'user' } = context;
    
    // Add role-specific actions
    if (userRole === 'collector') {
      switch (status) {
        case 'accepted':
          return [...baseActions, 'start_navigation'];
        case 'arrived':
          return [...baseActions, 'start_collection'];
        case 'collecting':
          return [...baseActions, 'complete_collection'];
        default:
          return baseActions;
      }
    }
    
    return baseActions;
  }
};

export default statusService;
