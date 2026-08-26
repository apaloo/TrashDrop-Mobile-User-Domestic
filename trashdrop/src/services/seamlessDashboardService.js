/**
 * Seamless Dashboard Service
 * Provides dashboard data with background caching and optimistic updates
 * Prevents data disappearing during fetches
 */

import seamlessCache from '../utils/seamlessCache.js';
import userServiceOptimized from './userServiceOptimized.js';
import requestDeduplicator from '../utils/requestDeduplication.js';
import supabase from '../utils/supabaseClient.js';
import { pickupService } from './pickupService.js';

class SeamlessDashboardService {
  constructor() {
    this.cacheKeys = {
      stats: (userId) => `dashboard_stats_${userId}`,
      activities: (userId) => `dashboard_activities_${userId}`,
      activePickups: (userId) => `active_pickups_${userId}`,
      notifications: (userId) => `notifications_${userId}`
    };
    
    this.setupOptimisticHandlers();
  }

  /**
   * Get user stats with seamless background update
   * @param {string} userId - User ID
   * @returns {Promise} User stats (immediate) with background updates
   */
  async getUserStats(userId) {
    const cacheKey = this.cacheKeys.stats(userId);
    
    return seamlessCache.get(
      cacheKey,
      async () => {
        console.log(`[SeamlessDashboard] 📊 Fetching fresh stats for user ${userId}`);
        const result = await userServiceOptimized.getUserStatsOptimized(userId);
        
        if (result.error) {
          throw new Error(result.error.message || 'Failed to fetch user stats');
        }
        
        return result.data;
      },
      {
        ttl: 30000, // 30 seconds
        staleWhileRevalidate: true
      }
    );
  }

  /**
   * Get recent activities with seamless background update
   * @param {string} userId - User ID
   * @param {number} limit - Maximum activities to return
   * @returns {Promise} Recent activities (immediate) with background updates
   */
  async getRecentActivities(userId, limit = 5) {
    const cacheKey = this.cacheKeys.activities(userId);
    
    return seamlessCache.get(
      cacheKey,
      async () => {
        console.log(`[SeamlessDashboard] 📝 Fetching fresh activities for user ${userId}`);
        const result = await userServiceOptimized.getRecentActivityOptimized(userId, limit);
        
        if (result.error) {
          throw new Error(result.error.message || 'Failed to fetch recent activities');
        }
        
        return result.data;
      },
      {
        ttl: 15000, // 15 seconds for activities
        staleWhileRevalidate: true
      }
    );
  }

  /**
   * Get active pickups with seamless background update
   * @param {string} userId - User ID
   * @returns {Promise} Active pickups (immediate) with background updates
   */
  async getActivePickups(userId) {
    const cacheKey = this.cacheKeys.activePickups(userId);
    
    return seamlessCache.get(
      cacheKey,
      async () => {
        console.log(`[SeamlessDashboard] 📦 Fetching active pickups for user ${userId}`);
        
        const result = await pickupService.getActivePickup(userId);
        
        if (result.error) {
          throw new Error(result.error.message || 'Failed to fetch active pickups');
        }
        
        return result.data ? [result.data] : [];
      },
      {
        ttl: 10000, // 10 seconds for pickups (more time-sensitive)
        staleWhileRevalidate: true
      }
    );
  }

  /**
   * Optimistically update stats when user performs action
   * @param {string} userId - User ID
   * @param {string} actionType - Type of action (pickup_request, qr_scan, etc.)
   * @param {Object} actionData - Action data
   */
  async optimisticUpdateStats(userId, actionType, actionData) {
    const cacheKey = this.cacheKeys.stats(userId);
    
    return seamlessCache.optimisticUpdate(
      cacheKey,
      // Optimistic update function
      (currentStats) => {
        console.log(`[SeamlessDashboard] ⚡ Optimistically updating stats for ${actionType}`);
        
        const updatedStats = { ...currentStats };
        
        switch (actionType) {
          case 'pickup_request':
            updatedStats.pickups = (updatedStats.pickups || 0) + 1;
            updatedStats.totalBags = Math.max(0, (updatedStats.totalBags || 0) - (actionData.bag_count || 1));
            updatedStats.points = (updatedStats.points || 0) + (actionData.points_earned || 10);
            break;
            
          case 'qr_scan':
            updatedStats.batches = (updatedStats.batches || 0) + 1;
            updatedStats.totalBags = (updatedStats.totalBags || 0) + (actionData.bag_count || 1);
            updatedStats.points = (updatedStats.points || 0) + (actionData.points_impact || 5);
            break;
            
          case 'dumping_report':
            updatedStats.reports = (updatedStats.reports || 0) + 1;
            const severity = actionData.severity || 'medium';
            const points = severity === 'high' ? 20 : severity === 'low' ? 10 : 15;
            updatedStats.points = (updatedStats.points || 0) + points;
            break;
            
          case 'digital_bin':
            updatedStats.pickups = (updatedStats.pickups || 0) + 1;
            updatedStats.points = (updatedStats.points || 0) + 15;
            break;
            
          case 'reward_redemption':
            updatedStats.points = Math.max(0, (updatedStats.points || 0) - (actionData.points_spent || 0));
            break;
        }
        
        console.log(`[SeamlessDashboard] ✨ Optimistic stats update:`, updatedStats);
        return updatedStats;
      },
      // Confirmation function (fetch fresh data from server)
      async () => {
        console.log(`[SeamlessDashboard] 🔄 Confirming stats update for ${actionType}`);
        const result = await userServiceOptimized.getUserStatsOptimized(userId);
        
        if (result.error) {
          throw new Error(result.error.message || 'Failed to confirm stats update');
        }
        
        return result.data;
      }
    );
  }

  /**
   * Optimistically add new activity to recent activities
   * @param {string} userId - User ID
   * @param {Object} activity - New activity data
   */
  async optimisticAddActivity(userId, activity) {
    const cacheKey = this.cacheKeys.activities(userId);
    
    return seamlessCache.optimisticUpdate(
      cacheKey,
      // Optimistic update function
      (currentActivities) => {
        console.log(`[SeamlessDashboard] ⚡ Optimistically adding activity: ${activity.type}`);
        
        const newActivity = {
          id: activity.id || `optimistic_${Date.now()}`,
          type: activity.type,
          description: activity.description,
          timestamp: activity.timestamp || new Date().toISOString(),
          related_id: activity.related_id,
          points: activity.points || 0,
          _source: 'optimistic',
          ...activity
        };
        
        // Add to beginning of array and limit to 5 items
        const updatedActivities = [newActivity, ...(currentActivities || [])].slice(0, 5);
        
        console.log(`[SeamlessDashboard] ✨ Optimistic activity added:`, newActivity);
        return updatedActivities;
      },
      // Confirmation function
      async () => {
        console.log(`[SeamlessDashboard] 🔄 Confirming activity update`);
        const result = await userServiceOptimized.getRecentActivityOptimized(userId, 5);
        
        if (result.error) {
          throw new Error(result.error.message || 'Failed to confirm activity update');
        }
        
        return result.data;
      }
    );
  }

  /**
   * Preload dashboard data in background
   * @param {string} userId - User ID
   */
  preloadDashboardData(userId) {
    console.log(`[SeamlessDashboard] 🚀 Preloading dashboard data for user ${userId}`);
    
    // Preload all dashboard data in background
    seamlessCache.preload(
      this.cacheKeys.stats(userId),
      async () => {
        const result = await userServiceOptimized.getUserStatsOptimized(userId);
        return result.data;
      },
      { ttl: 30000 }
    );
    
    seamlessCache.preload(
      this.cacheKeys.activities(userId),
      async () => {
        const result = await userServiceOptimized.getRecentActivityOptimized(userId, 5);
        return result.data;
      },
      { ttl: 15000 }
    );
    
    seamlessCache.preload(
      this.cacheKeys.activePickups(userId),
      async () => {
        const result = await pickupService.getActivePickup(userId);
        return result.data ? [result.data] : [];
      },
      { ttl: 10000 }
    );
  }

  /**
   * Subscribe to data updates
   * @param {string} userId - User ID
   * @param {Object} callbacks - Update callbacks
   * @returns {Object} Unsubscribe functions
   */
  subscribeToUpdates(userId, callbacks) {
    const unsubscribers = {};
    
    if (callbacks.onStatsUpdate) {
      unsubscribers.stats = seamlessCache.subscribe(
        this.cacheKeys.stats(userId),
        (data, type) => {
          console.log(`[SeamlessDashboard] 📊 Stats update: ${type}`, data);
          callbacks.onStatsUpdate(data, type);
        }
      );
    }
    
    if (callbacks.onActivitiesUpdate) {
      unsubscribers.activities = seamlessCache.subscribe(
        this.cacheKeys.activities(userId),
        (data, type) => {
          console.log(`[SeamlessDashboard] 📝 Activities update: ${type}`, data);
          callbacks.onActivitiesUpdate(data, type);
        }
      );
    }
    
    if (callbacks.onPickupsUpdate) {
      unsubscribers.pickups = seamlessCache.subscribe(
        this.cacheKeys.activePickups(userId),
        (data, type) => {
          console.log(`[SeamlessDashboard] 📦 Pickups update: ${type}`, data);
          callbacks.onPickupsUpdate(data, type);
        }
      );
    }
    
    return unsubscribers;
  }

  /**
   * Setup optimistic update handlers for real-time events
   */
  setupOptimisticHandlers() {
    if (typeof window === 'undefined') return;

    // Remove any previous listeners (prevents HMR duplicates)
    if (SeamlessDashboardService._activityHandler) {
      window.removeEventListener('trashdrop:activity-updated', SeamlessDashboardService._activityHandler);
    }
    if (SeamlessDashboardService._bagsHandler) {
      window.removeEventListener('trashdrop:bags-updated', SeamlessDashboardService._bagsHandler);
    }

    // Create named handlers stored on the class so they can be removed later
    SeamlessDashboardService._activityHandler = async (event) => {
      const { userId, activity } = event.detail || {};
      if (userId && activity) {
        await this.optimisticAddActivity(userId, activity);
      }
    };

    SeamlessDashboardService._bagsHandler = async (event) => {
      const { userId } = event.detail || {};
      if (userId) {
        // RPC already recalculated user_stats from actual batch data (COUNT/SUM).
        // Optimistic +1/+bags is always wrong because the RPC recalculates from scratch.
        // Just invalidate caches so dashboard fetches fresh data on next mount.
        seamlessCache.invalidate(this.cacheKeys.stats(userId));
        requestDeduplicator.clearCache('getUserStats');
        console.log('[SeamlessDashboard] 🔄 Caches invalidated after batch scan — fresh fetch on next load');
      }
    };

    window.addEventListener('trashdrop:activity-updated', SeamlessDashboardService._activityHandler);
    window.addEventListener('trashdrop:bags-updated', SeamlessDashboardService._bagsHandler);
  }

  /**
   * Force refresh all dashboard data
   * @param {string} userId - User ID
   */
  async forceRefresh(userId) {
    console.log(`[SeamlessDashboard] 🔄 Force refreshing dashboard data for user ${userId}`);
    
    // Invalidate all cache entries
    seamlessCache.invalidate(this.cacheKeys.stats(userId));
    seamlessCache.invalidate(this.cacheKeys.activities(userId));
    seamlessCache.invalidate(this.cacheKeys.activePickups(userId));
    
    // Fetch fresh data. One failing endpoint must not discard the other two,
    // so settle them all and only surface a failure if nothing came back.
    const results = await Promise.allSettled([
      this.getUserStats(userId),
      this.getRecentActivities(userId, 5),
      this.getActivePickups(userId)
    ]);
    
    const rejected = results.filter(result => result.status === 'rejected');
    if (rejected.length === results.length) {
      console.error('[SeamlessDashboard] ❌ Force refresh failed for every source');
      throw rejected[0].reason;
    }
    
    if (rejected.length > 0) {
      console.warn(
        `[SeamlessDashboard] ⚠️ Force refresh partially failed (${rejected.length}/${results.length}):`,
        rejected.map(result => result.reason?.message).join(', ')
      );
    }
    
    const [stats, activities, pickups] = results.map(
      result => (result.status === 'fulfilled' ? result.value : null)
    );
    
    return { stats, activities, pickups };
  }

  /**
   * Get cache statistics
   * @param {string} userId - User ID
   * @returns {Object} Cache stats
   */
  getCacheStats(userId) {
    const stats = seamlessCache.getStats();
    const userCacheEntries = [
      this.cacheKeys.stats(userId),
      this.cacheKeys.activities(userId),
      this.cacheKeys.activePickups(userId)
    ];
    
    const userStats = userCacheEntries.reduce((acc, key) => {
      acc[key] = seamlessCache.isFresh(key);
      return acc;
    }, {});
    
    return {
      ...stats,
      userEntries: userStats
    };
  }

  /**
   * Clear all dashboard cache for a user
   * @param {string} userId - User ID
   */
  clearUserCache(userId) {
    console.log(`[SeamlessDashboard] 🧹 Clearing cache for user ${userId}`);
    
    seamlessCache.invalidate(this.cacheKeys.stats(userId));
    seamlessCache.invalidate(this.cacheKeys.activities(userId));
    seamlessCache.invalidate(this.cacheKeys.activePickups(userId));
    seamlessCache.invalidate(this.cacheKeys.notifications(userId));
  }
}

// Create singleton instance
const seamlessDashboardService = new SeamlessDashboardService();

export default seamlessDashboardService;
export { SeamlessDashboardService };
