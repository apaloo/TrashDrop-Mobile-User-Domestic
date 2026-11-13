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
        console.log('[ActivityService] Querying user_activity table for user:', userId);
        const result = await supabase
          .from('user_activity')
          .select('id, user_id, activity_type, points_impact, related_id, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);
        
        console.log('[ActivityService] Database query result:', result);
        console.log('[ActivityService] Raw activity data from database:', result.data);
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
        description: `${activity.activity_type} activity`, // Simple description since no details column
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

  // formatActivityDetails removed - database doesn't have details column

};

export default activityService;
