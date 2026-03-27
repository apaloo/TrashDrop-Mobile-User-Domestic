/**
 * Optimized Real-time Subscription Manager
 * Consolidates multiple subscriptions into single efficient channel
 * Reduces overhead from 4+ subscriptions to 1
 */

import supabase from './supabaseClient.js';
import { handleStatsUpdate, handleDumpingReportUpdate } from './realtime.js';

export class RealtimeManager {
  constructor() {
    this.subscriptions = new Map(); // userId -> subscription info
    this.channel = null;
    this.mountedRef = null;
  }

  /**
   * Set up consolidated real-time subscription for a user
   * Single channel handles all dashboard updates
   * @param {string} userId - User ID
   * @param {Function} onStatsUpdate - Callback for stats updates
   * @param {Function} onActivityUpdate - Callback for activity updates
   * @param {Object} mountedRef - Component mounted ref
   * @returns {Function} Cleanup function
   */
  setupOptimizedSubscription(userId, onStatsUpdate, onActivityUpdate, mountedRef) {
    if (!userId) {
      console.warn('[RealtimeManager] No userId provided for subscription');
      return () => {};
    }

    // Clean up existing subscription for this user
    this.cleanupSubscription(userId);

    console.log('[RealtimeManager] 🚀 Setting up optimized subscription for user:', userId);
    this.mountedRef = mountedRef;

    // Create single consolidated channel
    this.channel = supabase
      .channel(`dashboard_${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_stats',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        if (!this.mountedRef?.current) return;
        
        console.log('[RealtimeManager] 📊 User stats update received:', payload);
        const updatedStats = handleStatsUpdate('user_stats', payload, onStatsUpdate?.prevStats || {});
        
        if (onStatsUpdate?.callback) {
          onStatsUpdate.callback(updatedStats);
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'pickup_requests',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        if (!this.mountedRef?.current) return;
        
        console.log('[RealtimeManager] 📦 New pickup request received:', payload);
        this.handlePickupUpdate(payload, onActivityUpdate);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'pickup_requests',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        if (!this.mountedRef?.current) return;
        
        console.log('[RealtimeManager] 📦 Pickup request updated:', payload);
        this.handlePickupStatusUpdate(payload, onActivityUpdate);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'illegal_dumping_mobile',
        filter: `reported_by=eq.${userId}`
      }, (payload) => {
        if (!this.mountedRef?.current) return;
        
        console.log('[RealtimeManager] 🚮 New dumping report received:', payload);
        this.handleDumpingReportUpdate(payload, onActivityUpdate);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'digital_bins',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        if (!this.mountedRef?.current) return;
        
        console.log('[RealtimeManager] 🗑️ New digital bin received:', payload);
        this.handleDigitalBinUpdate(payload, onActivityUpdate);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'digital_bins',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        if (!this.mountedRef?.current) return;
        
        console.log('[RealtimeManager] 🗑️ Digital bin updated:', payload);
        this.handleDigitalBinUpdate(payload, onActivityUpdate);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'alerts',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        if (!this.mountedRef?.current) return;
        
        console.log('[RealtimeManager] 🔔 New notification received:', payload);
        this.handleNotificationUpdate(payload, onActivityUpdate);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'alerts',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        if (!this.mountedRef?.current) return;
        
        console.log('[RealtimeManager] 🔔 Notification updated:', payload);
        this.handleNotificationUpdate(payload, onActivityUpdate);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[RealtimeManager] ✅ Optimized subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[RealtimeManager] ❌ Subscription error');
        }
      });

    // Store subscription info
    this.subscriptions.set(userId, {
      channel: this.channel,
      onStatsUpdate,
      onActivityUpdate,
      createdAt: Date.now()
    });

    // Return cleanup function
    return () => this.cleanupSubscription(userId);
  }

  /**
   * Handle pickup request updates
   * @param {Object} payload - Supabase payload
   * @param {Function} onActivityUpdate - Activity update callback
   */
  handlePickupUpdate(payload, onActivityUpdate) {
    const newPickup = payload.new;
    
    // Add to recent activities
    if (onActivityUpdate?.addActivity) {
      const activity = {
        id: newPickup.id,
        type: 'pickup_request',
        description: `Pickup request for ${newPickup.bag_count || 1} bag(s) - ${newPickup.status}`,
        timestamp: newPickup.created_at,
        related_id: newPickup.id,
        points: newPickup.points_earned || 10,
        _source: 'realtime'
      };
      onActivityUpdate.addActivity(activity);
    }

    // Refresh stats for bag count changes
    if (onActivityUpdate?.refreshStats) {
      onActivityUpdate.refreshStats();
    }

    // Handle auto-navigation for accepted pickups
    if (onActivityUpdate?.handlePickupAccepted) {
      onActivityUpdate.handlePickupAccepted(newPickup);
    }
  }

  /**
   * Handle pickup status updates
   * @param {Object} payload - Supabase payload
   * @param {Function} onActivityUpdate - Activity update callback
   */
  handlePickupStatusUpdate(payload, onActivityUpdate) {
    const { new: newStatus, old: oldStatus } = payload;
    
    // Update active pickup card
    if (onActivityUpdate?.updateActivePickup) {
      onActivityUpdate.updateActivePickup(newStatus);
    }

    // Auto-navigate when pickup is accepted or collector is en route
    const shouldNavigate = (
      (oldStatus?.status === 'available' && newStatus?.status === 'accepted') ||
      (oldStatus?.status === 'pending' && newStatus?.status === 'accepted') ||
      (oldStatus?.status === 'accepted' && newStatus?.status === 'en_route') ||
      (oldStatus?.status === 'available' && newStatus?.status === 'collector_assigned') ||
      (oldStatus?.status === 'pending' && newStatus?.status === 'collector_assigned')
    );

    if (shouldNavigate && onActivityUpdate?.handlePickupAccepted) {
      onActivityUpdate.handlePickupAccepted(newStatus);
    }

    // Refresh stats when collector is assigned
    if (newStatus?.collector_id && newStatus?.status === 'accepted' && onActivityUpdate?.refreshStats) {
      onActivityUpdate.refreshStats();
    }
  }

  /**
   * Handle dumping report updates
   * @param {Object} payload - Supabase payload
   * @param {Function} onActivityUpdate - Activity update callback
   */
  handleDumpingReportUpdate(payload, onActivityUpdate) {
    const newReport = payload.new;
    
    // Add to recent activities
    if (onActivityUpdate?.addActivity) {
      const severity = newReport.severity || 'medium';
      let points = 15; // default for medium
      if (severity === 'high') points = 20;
      else if (severity === 'low') points = 10;

      const activity = {
        id: newReport.id,
        type: 'dumping_report',
        description: `Reported ${newReport.waste_type || 'illegal dumping'} (${severity} severity)`,
        timestamp: newReport.created_at,
        related_id: newReport.id,
        points: points,
        _source: 'realtime'
      };
      onActivityUpdate.addActivity(activity);
    }

    // Refresh stats
    if (onActivityUpdate?.refreshStats) {
      onActivityUpdate.refreshStats();
    }
  }

  /**
   * Handle digital bin updates
   * @param {Object} payload - Supabase payload
   * @param {Function} onActivityUpdate - Activity update callback
   */
  handleDigitalBinUpdate(payload, onActivityUpdate) {
    const newBin = payload.new;
    
    // Add to recent activities
    if (onActivityUpdate?.addActivity) {
      const activity = {
        id: newBin.id,
        type: 'digital_bin',
        description: `Digital bin (${newBin.frequency}) created`,
        timestamp: newBin.created_at,
        related_id: newBin.id,
        points: 15,
        _source: 'realtime'
      };
      onActivityUpdate.addActivity(activity);
    }

    // Refresh stats
    if (onActivityUpdate?.refreshStats) {
      onActivityUpdate.refreshStats();
    }
  }

  /**
   * Handle notification updates
   * @param {Object} payload - Supabase payload
   * @param {Function} onActivityUpdate - Activity update callback
   */
  handleNotificationUpdate(payload, onActivityUpdate) {
    const { new: newAlert, old: oldAlert } = payload;
    
    if (payload.eventType === 'INSERT') {
      // New notification
      if (onActivityUpdate?.updateNotificationCount) {
        onActivityUpdate.updateNotificationCount(1);
      }
    } else if (payload.eventType === 'UPDATE') {
      // Notification read/unread
      if (newAlert?.status === 'read' && oldAlert?.status === 'unread') {
        if (onActivityUpdate?.updateNotificationCount) {
          onActivityUpdate.updateNotificationCount(-1);
        }
      }
    }
  }

  /**
   * Clean up subscription for a user
   * @param {string} userId - User ID
   */
  cleanupSubscription(userId) {
    const subscription = this.subscriptions.get(userId);
    if (subscription?.channel) {
      console.log('[RealtimeManager] 🧹 Cleaning up subscription for user:', userId);
      supabase.removeChannel(subscription.channel);
    }
    this.subscriptions.delete(userId);
  }

  /**
   * Clean up all subscriptions
   */
  cleanupAll() {
    console.log('[RealtimeManager] 🧹 Cleaning up all subscriptions');
    for (const [userId] of this.subscriptions) {
      this.cleanupSubscription(userId);
    }
  }

  /**
   * Get subscription statistics
   * @returns {Object} Subscription stats
   */
  getStats() {
    return {
      activeSubscriptions: this.subscriptions.size,
      totalSubscriptions: this.subscriptions.size,
      channelCount: this.channel ? 1 : 0,
      memoryUsage: this.subscriptions.size * 1024, // Estimated
      performance: 'optimal'
    };
  }

  /**
   * Check if subscription exists for user
   * @param {string} userId - User ID
   * @returns {boolean} Whether subscription exists
   */
  hasSubscription(userId) {
    return this.subscriptions.has(userId);
  }

  /**
   * Reconnect subscription if needed
   * @param {string} userId - User ID
   */
  async reconnectSubscription(userId) {
    const subscription = this.subscriptions.get(userId);
    if (subscription) {
      console.log('[RealtimeManager] 🔄 Reconnecting subscription for user:', userId);
      this.cleanupSubscription(userId);
      
      // Re-setup with same callbacks
      return this.setupOptimizedSubscription(
        userId,
        subscription.onStatsUpdate,
        subscription.onActivityUpdate,
        this.mountedRef
      );
    }
  }
}

// Singleton instance
const realtimeManager = new RealtimeManager();

export default realtimeManager;

// Convenience functions for backward compatibility
export const subscribeToDashboardUpdates = (userId, callbacks, mountedRef) => {
  return realtimeManager.setupOptimizedSubscription(userId, callbacks, callbacks, mountedRef);
};

export const unsubscribeFromDashboardUpdates = (userId) => {
  realtimeManager.cleanupSubscription(userId);
};

export const getRealtimeStats = () => realtimeManager.getStats();
