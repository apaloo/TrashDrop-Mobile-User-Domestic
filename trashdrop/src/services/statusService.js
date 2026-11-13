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
    tracking: true,
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
    // Set by the collector's scan: the waste is theirs to take to a disposal site
    display: 'Collected',
    description: 'Your collector has your waste and is taking it to a disposal site',
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

};

export default statusService;
