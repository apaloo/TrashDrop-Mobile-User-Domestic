/**
 * Smart Notification Service - Unified, context-aware notification system
 * Prevents notification fatigue while keeping users informed
 */

import { statusService } from './statusService.js';
import toastService from './toastService.js';
import { notificationService } from './notificationService.js';

/**
 * Notification strategies for different statuses
 */
const NOTIFICATION_STRATEGIES = {
  pending: {
    toast: false,
    alert: false,
    push: false,
    sound: false,
    priority: 'low',
    cooldown: 0
  },
  accepted: {
    toast: true,
    alert: true,
    push: true,
    sound: false,
    priority: 'high',
    cooldown: 0,
    title: 'Collector Assigned!',
    message: 'Your collector has been assigned and is preparing to help.',
    action: 'track'
  },
  en_route: {
    toast: false,
    alert: true,
    push: true,
    sound: false,
    priority: 'medium',
    cooldown: 300000, // 5 minutes
    title: 'Collector On the Way',
    message: 'Your collector is on the way to your location.',
    action: 'track'
  },
  arrived: {
    toast: false,
    alert: true,
    push: true,
    sound: true,
    priority: 'high',
    cooldown: 0,
    title: 'Collector Has Arrived!',
    message: 'Your collector has arrived at your location.',
    action: 'contact'
  },
  collecting: {
    toast: false,
    alert: true,
    push: false,
    sound: false,
    priority: 'medium',
    cooldown: 600000, // 10 minutes
    title: 'Collection in Progress',
    message: 'Your collector is collecting your waste.',
    action: 'track'
  },
  completed: {
    toast: true,
    alert: true,
    push: true,
    sound: true,
    priority: 'high',
    cooldown: 0,
    title: 'Service Completed!',
    message: 'Your waste has been collected successfully. Thank you!',
    action: 'rate'
  },
  cancelled: {
    toast: true,
    alert: true,
    push: true,
    sound: false,
    priority: 'high',
    cooldown: 0,
    title: 'Request Cancelled',
    message: 'Your pickup request has been cancelled.',
    action: 'reschedule'
  }
};

/**
 * Smart Notification Service
 */
export const smartNotificationService = {
  // Track last notification times to prevent spam
  lastNotifications: new Map(),
  
  // User preferences (could be loaded from profile)
  userPreferences: {
    enableToast: true,
    enableAlerts: true,
    enablePush: true,
    enableSound: true,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00'
    }
  },

  /**
   * Initialize notification service
   * @param {Object} preferences - User notification preferences
   */
  initialize(preferences = {}) {
    this.userPreferences = { ...this.userPreferences, ...preferences };
    console.log('[SmartNotificationService] Initialized with preferences:', this.userPreferences);
  },

  /**
   * Send smart notification based on status change
   * @param {Object} params - Notification parameters
   */
  async sendStatusNotification({
    userId,
    pickupId,
    oldStatus,
    newStatus,
    collectorName,
    eta,
    distance
  }) {
    try {
      console.log(`[SmartNotificationService] Status change: ${oldStatus} → ${newStatus}`);

      // Get notification strategy for new status
      const strategy = NOTIFICATION_STRATEGIES[newStatus];
      if (!strategy) {
        console.log(`[SmartNotificationService] No strategy for status: ${newStatus}`);
        return { success: false, reason: 'No strategy' };
      }

      // Check cooldown period
      if (this.isInCooldown(pickupId, newStatus, strategy.cooldown)) {
        console.log(`[SmartNotificationService] Notification in cooldown period`);
        return { success: false, reason: 'Cooldown' };
      }

      // Check quiet hours
      if (this.isQuietHours() && strategy.priority !== 'high') {
        console.log(`[SmartNotificationService] Quiet hours - suppressing notification`);
        return { success: false, reason: 'Quiet hours' };
      }

      // Generate notification content
      const notification = this.generateNotificationContent({
        strategy,
        collectorName,
        eta,
        distance,
        pickupId
      });

      // Send notifications based on strategy and user preferences
      const results = await this.executeNotificationStrategy({
        userId,
        strategy,
        notification,
        pickupId
      });

      // Update last notification time
      this.updateLastNotification(pickupId, newStatus);

      return {
        success: true,
        strategy: newStatus,
        results
      };

    } catch (error) {
      console.error('[SmartNotificationService] Error sending notification:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Check if notification is in cooldown period
   * @param {string} pickupId - Pickup ID
   * @param {string} status - Current status
   * @param {number} cooldown - Cooldown period in milliseconds
   * @returns {boolean} Whether in cooldown
   */
  isInCooldown(pickupId, status, cooldown) {
    if (cooldown === 0) return false;

    const lastKey = `${pickupId}_${status}`;
    const lastTime = this.lastNotifications.get(lastKey);
    
    if (!lastTime) return false;

    return Date.now() - lastTime < cooldown;
  },

  /**
   * Check if current time is in quiet hours
   * @returns {boolean} Whether in quiet hours
   */
  isQuietHours() {
    if (!this.userPreferences.quietHours.enabled) return false;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = this.userPreferences.quietHours.start.split(':').map(Number);
    const [endHour, endMin] = this.userPreferences.quietHours.end.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    if (startTime <= endTime) {
      // Same day period (e.g., 22:00 to 07:00 crosses midnight)
      return currentTime >= startTime || currentTime < endTime;
    } else {
      // Crosses midnight
      return currentTime >= startTime || currentTime < endTime;
    }
  },

  /**
   * Generate notification content
   * @param {Object} params - Content generation parameters
   * @returns {Object} Notification content
   */
  generateNotificationContent({ strategy, collectorName, eta, distance, pickupId }) {
    let title = strategy.title;
    let message = strategy.message;
    let action = strategy.action;

    // Personalize with collector name
    if (collectorName && strategy.priority === 'high') {
      message = message.replace('Your collector', `${collectorName}`);
    }

    // Add ETA information for en_route status
    if (eta && (strategy.title.includes('On the Way') || strategy.title.includes('En Route'))) {
      message += ` ETA: ${eta} minutes`;
    }

    // Add distance information
    if (distance && distance < 5) {
      message += ` (${distance} km away)`;
    }

    return {
      id: `notification_${pickupId}_${Date.now()}`,
      title,
      message,
      action,
      priority: strategy.priority,
      sound: strategy.sound && this.userPreferences.enableSound,
      data: {
        pickupId,
        status: strategy.title,
        timestamp: new Date().toISOString()
      }
    };
  },

  /**
   * Execute notification strategy
   * @param {Object} params - Execution parameters
   * @returns {Object} Execution results
   */
  async executeNotificationStrategy({ userId, strategy, notification, pickupId }) {
    const results = {};

    // Toast notifications
    if (strategy.toast && this.userPreferences.enableToast) {
      try {
        toastService.success(notification.message, {
          duration: strategy.priority === 'high' ? 5000 : 3000,
          action: notification.action ? {
            label: this.getActionLabel(notification.action),
            onClick: () => this.handleNotificationAction(notification.action, pickupId)
          } : undefined
        });
        results.toast = 'sent';
      } catch (error) {
        results.toast = `error: ${error.message}`;
      }
    }

    // In-app alerts
    if (strategy.alert && this.userPreferences.enableAlerts) {
      try {
        await notificationService.createNotification(
          userId,
          'pickup_status',
          notification.title,
          notification.message,
          {
            pickupId,
            action: notification.action,
            priority: strategy.priority
          }
        );
        results.alert = 'sent';
      } catch (error) {
        results.alert = `error: ${error.message}`;
      }
    }

    // Push notifications (if available)
    if (strategy.push && this.userPreferences.enablePush) {
      try {
        // This would integrate with your push notification service
        // For now, we'll just log it
        console.log('[SmartNotificationService] Push notification would be sent:', notification);
        results.push = 'sent';
      } catch (error) {
        results.push = `error: ${error.message}`;
      }
    }

    // Sound notifications
    if (strategy.sound && this.userPreferences.enableSound) {
      try {
        this.playNotificationSound(strategy.priority);
        results.sound = 'played';
      } catch (error) {
        results.sound = `error: ${error.message}`;
      }
    }

    return results;
  },

  /**
   * Update last notification time
   * @param {string} pickupId - Pickup ID
   * @param {string} status - Status
   */
  updateLastNotification(pickupId, status) {
    const key = `${pickupId}_${status}`;
    this.lastNotifications.set(key, Date.now());
  },

  /**
   * Get action label for button
   * @param {string} action - Action type
   * @returns {string} Action label
   */
  getActionLabel(action) {
    const labels = {
      track: 'Track',
      contact: 'Call',
      rate: 'Rate',
      reschedule: 'Reschedule',
      view: 'View'
    };
    return labels[action] || 'View';
  },

  /**
   * Handle notification action
   * @param {string} action - Action type
   * @param {string} pickupId - Pickup ID
   */
  handleNotificationAction(action, pickupId) {
    switch (action) {
      case 'track':
        window.location.href = `/collector-tracking?pickupId=${pickupId}`;
        break;
      case 'contact':
        // This would open contact options
        console.log('Contact action for pickup:', pickupId);
        break;
      case 'rate':
        window.location.href = `/rate-service?pickupId=${pickupId}`;
        break;
      case 'reschedule':
        window.location.href = `/pickup-request`;
        break;
      default:
        console.log('Unknown action:', action);
    }
  },

  /**
   * Play notification sound
   * @param {string} priority - Notification priority
   */
  playNotificationSound(priority) {
    if (!this.userPreferences.enableSound) return;

    try {
      // Create audio context for notification sound
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create a simple notification sound
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Different sounds for different priorities
      if (priority === 'high') {
        oscillator.frequency.value = 800; // Higher pitch for important notifications
        gainNode.gain.value = 0.3;
      } else {
        oscillator.frequency.value = 600; // Lower pitch for regular notifications
        gainNode.gain.value = 0.2;
      }
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.2); // Short beep
      
    } catch (error) {
      console.log('[SmartNotificationService] Could not play sound:', error);
    }
  },

  /**
   * Update user preferences
   * @param {Object} preferences - New preferences
   */
  updatePreferences(preferences) {
    this.userPreferences = { ...this.userPreferences, ...preferences };
    console.log('[SmartNotificationService] Updated preferences:', this.userPreferences);
  },

  /**
   * Clear notification history
   */
  clearHistory() {
    this.lastNotifications.clear();
    console.log('[SmartNotificationService] Cleared notification history');
  },

  /**
   * Get notification statistics
   * @returns {Object} Notification statistics
   */
  getStats() {
    return {
      totalNotifications: this.lastNotifications.size,
      userPreferences: this.userPreferences,
      isQuietHours: this.isQuietHours(),
      recentNotifications: Array.from(this.lastNotifications.entries())
        .map(([key, time]) => ({
          key,
          time: new Date(time).toISOString(),
          age: Date.now() - time
        }))
        .filter(n => n.age < 3600000) // Last hour
    };
  }
};

export default smartNotificationService;
