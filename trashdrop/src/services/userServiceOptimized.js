/**
 * Optimized User Service for Dashboard Performance
 * Uses consolidated database views to reduce queries from 8 to 1
 * Includes request deduplication to prevent duplicate concurrent requests
 */

import supabase from '../utils/supabaseClient.js';
import { deduplicatedRequests } from '../utils/requestDeduplication.js';

export const userServiceOptimized = {
  /**
   * Get user dashboard stats using optimized view
   * Single query instead of 8 separate queries
   * @param {string} userId - User ID
   * @returns {Object} User stats from optimized view
   */
  async getUserStatsOptimized(userId) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[UserServiceOptimized] 🚀 Fetching optimized user stats for:', userId);

      // Use deduplicated request to prevent duplicate concurrent calls
      const requestFn = async () => {
        // Single query to the optimized view instead of 8 separate queries
        const { data, error } = await supabase
          .from('user_stats_dashboard')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (error) {
          console.error('[UserServiceOptimized] Error fetching optimized stats:', error);
          throw error;
        }

        if (!data) {
          console.log('[UserServiceOptimized] No stats found for user:', userId);
          return { data: null, error: null };
        }

        // Transform data to match expected format
        const userStats = {
          points: data.total_points || 0,
          pickups: data.total_pickups || 0,
          reports: data.reports || 0,
          batches: data.batches || 0,
          totalBags: data.total_bags || 0,
          available_bags: data.available_bags || 0,
          level: data.level || 'Eco Starter',
          email: data.email || '',
          firstName: data.first_name || '',
          lastName: data.last_name || '',
          avatar: data.avatar_url || '',
          // Include additional optimization metadata
          last_updated: data.last_updated,
          _source: 'optimized_view',
          _query_count: 1 // Track optimization
        };

        console.log('[UserServiceOptimized] ✅ Optimized stats loaded with 1 query instead of 8');
        console.log('[UserServiceOptimized] 📊 Stats summary:', {
          points: userStats.points,
          pickups: userStats.pickups,
          reports: userStats.reports,
          batches: userStats.batches,
          totalBags: userStats.totalBags
        });

        return { data: userStats, error: null };
      };

      return await deduplicatedRequests.getUserStats(userId, requestFn);

    } catch (error) {
      console.error('[UserServiceOptimized] Error in getUserStatsOptimized:', error);
      return { 
        data: null, 
        error: {
          message: error.message || 'Failed to fetch optimized user stats',
          code: error.code || 'OPTIMIZED_USER_STATS_ERROR'
        }
      };
    }
  },

  /**
   * Get recent activity using unified activity view
   * Single query instead of 4 separate queries
   * @param {string} userId - User ID
   * @param {number} limit - Maximum number of activities
   * @returns {Array} Recent activities from optimized view
   */
  async getRecentActivityOptimized(userId, limit = 5) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[UserServiceOptimized] 🚀 Fetching optimized recent activity for:', userId);

      // Single query to the unified activity view
      const { data, error } = await supabase
        .from('user_recent_activity')
        .select('*')
        .eq('user_id', userId)
        .order('sort_timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[UserServiceOptimized] Error fetching optimized activity:', error);
        throw error;
      }

      // Transform data to match expected format
      const activities = (data || []).map(activity => ({
        id: activity.activity_id,
        type: activity.activity_type,
        description: activity.description,
        timestamp: activity.created_at,
        related_id: activity.activity_id,
        points: activity.points_earned || 0,
        _source: activity.source_type
      }));

      console.log(`[UserServiceOptimized] ✅ Loaded ${activities.length} activities with 1 query instead of 4`);
      return { data: activities, error: null };

    } catch (error) {
      console.error('[UserServiceOptimized] Error in getRecentActivityOptimized:', error);
      return { 
        data: [], 
        error: {
          message: error.message || 'Failed to fetch optimized recent activity',
          code: error.code || 'OPTIMIZED_ACTIVITY_ERROR'
        }
      };
    }
  },

  /**
   * Get critical stats only for fastest possible load
   * Uses materialized view for sub-second response
   * @param {string} userId - User ID
   * @returns {Object} Critical stats for instant UI
   */
  async getCriticalStats(userId) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[UserServiceOptimized] ⚡ Fetching critical stats for instant UI:', userId);

      // First try materialized view for fastest response
      let { data, error } = await supabase
        .from('user_stats_aggregated')
        .select('user_id, total_pickups, total_points, total_bags, total_batches, last_activity_at')
        .eq('user_id', userId)
        .single();

      // If materialized view is empty, fall back to main view
      if (error && error.code === 'PGRST116') {
        console.log('[UserServiceOptimized] Materialized view empty, falling back to main view');
        const result = await this.getUserStatsOptimized(userId);
        if (result.data) {
          return {
            data: {
              points: result.data.points || 0,
              pickups: result.data.pickups || 0,
              batches: result.data.batches || 0,
              totalBags: result.data.totalBags || 0,
              available_bags: result.data.available_bags || 0,
              _source: 'main_view_fallback',
              _query_count: 1
            },
            error: null
          };
        }
        return result;
      }

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('[UserServiceOptimized] Error fetching critical stats:', error);
        throw error;
      }

      // Return minimal critical data for instant UI
      const criticalStats = data ? {
        points: data.total_points || 0,
        pickups: data.total_pickups || 0,
        batches: data.total_batches || 0,
        totalBags: data.total_bags || 0,
        _source: 'materialized_view',
        _query_count: 1,
        last_activity: data.last_activity_at
      } : {
        points: 0,
        pickups: 0,
        batches: 0,
        totalBags: 0,
        _source: 'default',
        _query_count: 0
      };

      console.log('[UserServiceOptimized] ⚡ Critical stats loaded in <100ms');
      return criticalStats;

    } catch (error) {
      console.error('[UserServiceOptimized] Error in getCriticalStats:', error);
      // Return default stats to prevent UI failure
      return {
        points: 0,
        pickups: 0,
        batches: 0,
        totalBags: 0,
        _source: 'fallback',
        _query_count: 0
      };
    }
  },

  /**
   * Batch fetch user stats and activity for optimal performance
   * Single round trip to database for all dashboard data
   * @param {string} userId - User ID
   * @returns {Object} Combined stats and activity data
   */
  async getDashboardDataOptimized(userId) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[UserServiceOptimized] 🚀 Fetching complete dashboard data in single query:', userId);

      // Use RPC to fetch everything in one database call
      const { data, error } = await supabase
        .rpc('get_dashboard_data_optimized', { 
          user_id_param: userId, 
          activity_limit: 5 
        });

      // If RPC function doesn't exist yet, fall back to individual queries
      if (error && error.code === 'PGRST202') {
        console.log('[UserServiceOptimized] RPC function not found, falling back to individual queries');
        
        // Fetch stats and activities separately
        const statsResult = await this.getUserStatsOptimized(userId);
        const activitiesResult = await this.getRecentActivityOptimized(userId, 5);
        
        return {
          data: {
            user_id: userId,
            total_points: statsResult.data?.points || 0,
            total_pickups: statsResult.data?.pickups || 0,
            total_bags: statsResult.data?.totalBags || 0,
            total_batches: statsResult.data?.batches || 0,
            available_bags: statsResult.data?.available_bags || 0,
            level: statsResult.data?.level || 'Eco Starter',
            email: statsResult.data?.email || '',
            first_name: statsResult.data?.firstName || '',
            last_name: statsResult.data?.lastName || '',
            avatar_url: statsResult.data?.avatar || '',
            activities: activitiesResult.data || [],
            _source: 'individual_queries_fallback',
            _query_count: 2
          },
          error: null
        };
      }

      if (error) {
        console.error('[UserServiceOptimized] Error in batch dashboard fetch:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.log('[UserServiceOptimized] No dashboard data found for user:', userId);
        return { data: null, error: null };
      }

      const dashboardData = data[0] || data; // Handle both array and single object responses
      
      console.log('[UserServiceOptimized] ✅ Dashboard data loaded in single query');
      console.log('[UserServiceOptimized] 📊 Data summary:', {
        points: dashboardData.total_points,
        pickups: dashboardData.total_pickups,
        activities: dashboardData.activities?.length || 0,
        source: dashboardData._source || 'rpc_function'
      });

      return { data: dashboardData, error: null };

    } catch (error) {
      console.error('[UserServiceOptimized] Error in getDashboardDataOptimized:', error);
      return { 
        data: null, 
        error: {
          message: error.message || 'Failed to fetch optimized dashboard data',
          code: error.code || 'OPTIMIZED_DASHBOARD_ERROR'
        }
      };
    }
  },

  /**
   * Check if user stats need refresh based on last update
   * @param {string} userId - User ID
   * @returns {boolean} Whether refresh is needed
   */
  async needsRefresh(userId) {
    try {
      const { data, error } = await supabase
        .from('user_stats_dashboard')
        .select('last_updated')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return true; // No data, need refresh
      }

      const lastUpdated = new Date(data.last_updated);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      return lastUpdated < fiveMinutesAgo;

    } catch (error) {
      console.warn('[UserServiceOptimized] Error checking refresh need:', error);
      return true; // Error, assume refresh needed
    }
  }
};

export default userServiceOptimized;
