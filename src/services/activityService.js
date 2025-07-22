/**
 * Activity service for handling user activity database operations
 * Replaces activity mock data with real Supabase queries
 */

import supabase from '../utils/supabaseClient.js';

export const activityService = {
  /**
   * Get recent activity for a user
   * @param {string} userId - User ID
   * @param {number} limit - Number of activities to fetch
   * @returns {Array} Array of user activities
   */
  async getUserActivity(userId, limit = 10) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[ActivityService] Fetching user activity for:', userId);

      let data = null;
      let error = null;
      
      try {
        // Only use verified working columns (id, user_id)
        const result = await supabase
          .from('user_activity')
          .select('id, user_id, activity_type, points_impact, related_id, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);
        data = result.data;
        error = result.error;
      } catch (queryError) {
        console.warn('[ActivityService] user_activity table query failed:', queryError.message);
        error = queryError;
      }

      if (error) {
        console.error('[ActivityService] Error fetching user activity:', error);
        throw error;
      }

      const formattedActivity = data?.map(activity => ({
        id: activity.id,
        user_id: activity.user_id,
        type: activity.activity_type,
        status: 'completed', // Assuming logged activities are completed
        details: this.formatActivityDetails(activity),
        points: activity.points_impact || 0,
        related_id: activity.related_id,
        created_at: activity.created_at,
        updated_at: activity.created_at // Use created_at as updated_at for activity logs
      })) || [];

      console.log(`[ActivityService] Found ${formattedActivity.length} activities`);
      return { data: formattedActivity, error: null };

    } catch (error) {
      console.error('[ActivityService] Error in getUserActivity:', error);
      return { 
        data: [], 
        error: {
          message: error.message || 'Failed to fetch user activity',
          code: error.code || 'USER_ACTIVITY_ERROR'
        }
      };
    }
  },

  /**
   * Format activity details based on activity type
   * @param {Object} activity - Activity record
   * @returns {string} Formatted activity description
   */
  formatActivityDetails(activity) {
    const activityType = activity.activity_type;
    
    switch (activityType) {
      case 'pickup_completed':
        return `Completed pickup request - ${activity.points_impact || 0} points earned`;
      case 'pickup_created':
        return `Created new pickup request`;
      case 'report_created':
        return `Reported illegal dumping - ${activity.points_impact || 0} points earned`;
      case 'bag_scanned':
        return `Scanned trash bag - ${activity.points_impact || 0} points earned`;
      case 'reward_redeemed':
        return `Redeemed reward - ${Math.abs(activity.points_impact) || 0} points used`;
      case 'batch_processed':
        return `Processed trash batch - ${activity.points_impact || 0} points earned`;
      case 'points_earned':
        return `Earned ${activity.points_impact || 0} points`;
      case 'points_deducted':
        return `Used ${Math.abs(activity.points_impact) || 0} points`;
      case 'level_up':
        return `Leveled up! Welcome to the next tier`;
      default:
        return `Activity: ${activityType}`;
    }
  },

  /**
   * Log a new user activity
   * @param {string} userId - User ID
   * @param {string} activityType - Type of activity
   * @param {string} relatedId - Related record ID (optional)
   * @param {number} pointsImpact - Points impact (positive/negative)
   * @returns {Object} Created activity record
   */
  async logActivity(userId, activityType, relatedId = null, pointsImpact = 0) {
    try {
      if (!userId || !activityType) {
        throw new Error('User ID and activity type are required');
      }

      console.log('[ActivityService] Logging activity:', { userId, activityType, pointsImpact });

      const activityData = {
        user_id: userId,
        activity_type: activityType,
        related_id: relatedId,
        points_impact: pointsImpact,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('user_activity')
        .insert(activityData)
        .select()
        .single();

      if (error) {
        console.error('[ActivityService] Error logging activity:', error);
        throw error;
      }

      console.log('[ActivityService] Successfully logged activity:', data.id);
      return { data, error: null };

    } catch (error) {
      console.error('[ActivityService] Error in logActivity:', error);
      return { 
        data: null, 
        error: {
          message: error.message || 'Failed to log activity',
          code: error.code || 'LOG_ACTIVITY_ERROR'
        }
      };
    }
  },

  /**
   * Get activity statistics for a user
   * @param {string} userId - User ID
   * @param {string} timeframe - Time frame ('day', 'week', 'month', 'year')
   * @returns {Object} Activity statistics
   */
  async getActivityStats(userId, timeframe = 'month') {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[ActivityService] Fetching activity stats for:', userId, timeframe);

      // Calculate date threshold based on timeframe
      const now = new Date();
      const thresholdDate = new Date();
      
      switch (timeframe) {
        case 'day':
          thresholdDate.setDate(now.getDate() - 1);
          break;
        case 'week':
          thresholdDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          thresholdDate.setMonth(now.getMonth() - 1);
          break;
        case 'year':
          thresholdDate.setFullYear(now.getFullYear() - 1);
          break;
        default:
          thresholdDate.setMonth(now.getMonth() - 1);
      }

      const { data, error } = await supabase
        .from('user_activity')
        .select('id, user_id, activity_type, points_impact')
        .eq('user_id', userId)
        .gte('created_at', thresholdDate.toISOString());

      if (error) {
        console.error('[ActivityService] Error fetching activity stats:', error);
        throw error;
      }

      // Calculate statistics
      const stats = {
        total_activities: data?.length || 0,
        points_earned: 0,
        points_spent: 0,
        pickups_completed: 0,
        reports_created: 0,
        bags_scanned: 0,
        rewards_redeemed: 0
      };

      data?.forEach(activity => {
        const points = activity.points_impact || 0;
        
        if (points > 0) {
          stats.points_earned += points;
        } else if (points < 0) {
          stats.points_spent += Math.abs(points);
        }

        // Count specific activity types
        switch (activity.activity_type) {
          case 'pickup_completed':
            stats.pickups_completed++;
            break;
          case 'report_created':
            stats.reports_created++;
            break;
          case 'bag_scanned':
            stats.bags_scanned++;
            break;
          case 'reward_redeemed':
            stats.rewards_redeemed++;
            break;
        }
      });

      console.log('[ActivityService] Activity stats calculated:', stats);
      return { data: stats, error: null };

    } catch (error) {
      console.error('[ActivityService] Error in getActivityStats:', error);
      return { 
        data: null, 
        error: {
          message: error.message || 'Failed to fetch activity stats',
          code: error.code || 'ACTIVITY_STATS_ERROR'
        }
      };
    }
  },

  /**
   * Get points history for rewards page
   * @param {string} userId - User ID
   * @param {number} limit - Number of records to fetch
   * @returns {Array} Array of point-related activities
   */
  async getPointsHistory(userId, limit = 20) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[ActivityService] Fetching points history for:', userId);

      const { data, error } = await supabase
        .from('user_activity')
        .select('id, user_id, activity_type, points_impact, related_id, created_at')
        .eq('user_id', userId)
        .neq('points_impact', 0) // Only activities that affected points
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[ActivityService] Error fetching points history:', error);
        throw error;
      }

      const formattedHistory = data?.map(activity => ({
        id: activity.id,
        activity_type: activity.activity_type,
        description: this.formatActivityDetails(activity),
        points: activity.points_impact,
        date: activity.created_at,
        related_id: activity.related_id
      })) || [];

      console.log(`[ActivityService] Found ${formattedHistory.length} point activities`);
      return { data: formattedHistory, error: null };

    } catch (error) {
      console.error('[ActivityService] Error in getPointsHistory:', error);
      return { 
        data: [], 
        error: {
          message: error.message || 'Failed to fetch points history',
          code: error.code || 'POINTS_HISTORY_ERROR'
        }
      };
    }
  }
};

export default activityService;
