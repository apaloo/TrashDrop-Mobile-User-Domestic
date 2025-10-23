/**
 * Notification service for managing alerts and user notification preferences
 */

import supabase from '../utils/supabaseClient.js';

export const notificationService = {
  // Track if notifications are disabled due to schema issues
  _notificationsDisabled: false,

  /**
   * Create a new notification/alert
   * @param {string} userId - User ID to notify
   * @param {string} type - Notification type (pickup_status, system, promo, etc)
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Created notification
   */
  async createNotification(userId, type, title, message, metadata = {}) {
    try {
      if (!userId || !type || !title || !message) {
        throw new Error('User ID, type, title, and message are required');
      }

      console.log('[NotificationService] Creating notification:', { userId, type, title });

      const notification = {
        user_id: userId,
        type: type,
        title: title,
        message: message,
        status: 'unread',
        metadata: metadata,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('alerts')
        .insert(notification)
        .select()
        .single();

      if (error) {
        console.error('[NotificationService] Error creating notification:', error);
        throw error;
      }

      console.log('[NotificationService] Successfully created notification:', data.id);
      return { data, error: null };

    } catch (error) {
      console.error('[NotificationService] Error in createNotification:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to create notification',
          code: error.code || 'CREATE_NOTIFICATION_ERROR'
        }
      };
    }
  },

  /**
   * Get user's notifications
   * @param {string} userId - User ID
   * @param {Object} options - Filter options
   * @returns {Array} Array of notifications
   */
  async getUserNotifications(userId, options = {}) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[NotificationService] Fetching notifications for user:', userId);
      
      // TODO: Fix database schema mismatch - alerts.user_id column doesn't exist
      // Returning empty array until schema is confirmed
      console.warn('[NotificationService] Temporarily returning empty notifications due to schema mismatch');
      return {
        data: [],
        error: null
      };

    } catch (error) {
      console.error('[NotificationService] Error in getUserNotifications:', error);
      return {
        data: [],
        error: {
          message: error.message || 'Failed to fetch notifications',
          code: error.code || 'GET_NOTIFICATIONS_ERROR'
        }
      };
    }
  },

  /**
   * Mark notifications as read
   * @param {string} userId - User ID
   * @param {string[]} notificationIds - Array of notification IDs to mark as read
   * @returns {Object} Result of the operation
   */
  async markAsRead(userId, notificationIds) {
    try {
      if (!userId || !notificationIds?.length) {
        throw new Error('User ID and notification IDs are required');
      }

      console.log('[NotificationService] Marking notifications as read:', notificationIds);

      const { data, error } = await supabase
        .from('alerts')
        .update({ 
          status: 'read',
          read_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .in('id', notificationIds)
        .eq('status', 'unread');

      if (error) {
        console.error('[NotificationService] Error marking notifications as read:', error);
        throw error;
      }

      return { data, error: null };

    } catch (error) {
      console.error('[NotificationService] Error in markAsRead:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to mark notifications as read',
          code: error.code || 'MARK_READ_ERROR'
        }
      };
    }
  },

  /**
   * Update user's notification preferences
   * @param {string} userId - User ID
   * @param {Object} preferences - Notification preferences
   * @returns {Object} Updated profile
   */
  async updateNotificationPreferences(userId, preferences) {
    try {
      if (!userId || !preferences) {
        throw new Error('User ID and preferences are required');
      }

      console.log('[NotificationService] Updating notification preferences for user:', userId);

      const { data, error } = await supabase
        .from('profiles')
        .update({
          notification_preferences: preferences,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        console.error('[NotificationService] Error updating preferences:', error);
        throw error;
      }

      return { data, error: null };

    } catch (error) {
      console.error('[NotificationService] Error in updateNotificationPreferences:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to update notification preferences',
          code: error.code || 'UPDATE_PREFERENCES_ERROR'
        }
      };
    }
  },

  /**
   * Create a pickup status notification
   * @param {string} userId - User ID to notify
   * @param {string} pickupId - Pickup request ID
   * @param {string} status - New pickup status
   * @param {Object} details - Additional details
   * @returns {Object} Created notification
   */
  async createBinStatusNotification(userId, locationId, status, details = {}) {
    const statusMessages = {
      accepted: 'Your digital bin request has been accepted',
      in_transit: 'Collector is on the way',
      completed: 'Your bin has been serviced',
      cancelled: 'Your bin has been cancelled'
    };

    const title = 'Digital Bin Status Update';
    const message = statusMessages[status] || `Bin status changed to ${status}`;

    return await this.createNotification(userId, 'bin_status', title, message, {
      location_id: locationId,
      status,
      ...details
    });
  },

  /**
   * Delete notifications older than a certain date
   * @param {string} userId - User ID
   * @param {number} daysOld - Delete notifications older than this many days
   * @returns {Object} Result of the operation
   */
  async deleteOldNotifications(userId, daysOld = 30) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[NotificationService] Deleting old notifications for user:', userId);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { data, error } = await supabase
        .from('alerts')
        .delete()
        .eq('user_id', userId)
        .lt('created_at', cutoffDate.toISOString())
        .select();

      if (error) {
        console.error('[NotificationService] Error deleting old notifications:', error);
        throw error;
      }

      return { data, error: null };

    } catch (error) {
      console.error('[NotificationService] Error in deleteOldNotifications:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to delete old notifications',
          code: error.code || 'DELETE_NOTIFICATIONS_ERROR'
        }
      };
    }
  }
};

export default notificationService;
