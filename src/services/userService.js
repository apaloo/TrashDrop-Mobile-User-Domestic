/**
 * User service for handling user-related database operations
 * Replaces mock data with real Supabase queries
 */

import supabase from '../utils/supabaseClient.js';

export const userService = {
  /**
   * Get user profile and stats from database
   * @param {string} userId - User ID
   * @returns {Object} User stats including points, pickups, reports, etc.
   */
  async getUserStats(userId) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[UserService] Fetching user stats for:', userId);

      // Fetch user profile data - try different approaches for schema compatibility
      let profileData = null;
      let profileError = null;
      
      // Only use the verified 'id' column
      const profileResult = await supabase
        .from('profiles')
        .select('id, points, level, email, first_name, last_name, avatar_url')
        .eq('id', userId)
        .maybeSingle();
      
      profileData = profileResult.data;
      profileError = profileResult.error;

      if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('[UserService] Error fetching profile:', profileError);
        throw profileError;
      }

      // Fetch user stats if available - handle potential table not existing
      let statsData = null;
      let statsError = null;
      
      try {
        const result = await supabase
          .from('user_stats')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        statsData = result.data;
        statsError = result.error;
      } catch (error) {
        // Table might not exist, continue without stats
        console.warn('[UserService] user_stats table not accessible:', error.message);
        statsError = error;
      }

      if (statsError && statsError.code !== 'PGRST116') {
        console.error('[UserService] Error fetching stats:', statsError);
      }

      // Count user's pickup requests - handle potential schema issues
      let pickupCount = 0;
      let pickupError = null;
      
      try {
        const result = await supabase
          .from('pickup_requests')
          .select('id', { count: 'exact' })
          .eq('collector_id', userId)
          .eq('status', 'completed');
        pickupCount = result.count;
        pickupError = result.error;
      } catch (error) {
        console.warn('[UserService] pickup_requests table query failed:', error.message);
        pickupError = error;
      }

      if (pickupError) {
        console.error('[UserService] Error counting pickups:', pickupError);
      }

      // Count user's dumping reports - handle potential schema issues
      let reportCount = 0;
      let reportError = null;
      
      try {
        const result = await supabase
          .from('illegal_dumping')
          .select('id', { count: 'exact' })
          .eq('reported_by', userId);
        reportCount = result.count;
        reportError = result.error;
      } catch (error) {
        console.warn('[UserService] illegal_dumping table query failed:', error.message);
        reportError = error;
      }

      if (reportError) {
        console.error('[UserService] Error counting reports:', reportError);
      }

      // Count user's bag scans - handle potential schema issues
      let bagCount = 0;
      let bagError = null;
      
      try {
        const result = await supabase
          .from('bag_inventory')
          .select('id', { count: 'exact' })
          .eq('user_id', userId);
        bagCount = result.count;
        bagError = result.error;
      } catch (error) {
        console.warn('[UserService] bag_inventory table query failed:', error.message);
        bagError = error;
      }

      if (bagError) {
        console.error('[UserService] Error counting bags:', bagError);
      }

      // Calculate total bags from pickup requests - handle schema issues
      let pickupBags = [];
      let pickupBagsError = null;
      
      try {
        const result = await supabase
          .from('pickup_requests')
          .select('id, bag_count')
          .eq('collector_id', userId)
          .eq('status', 'completed');
        pickupBags = result.data;
        pickupBagsError = result.error;
      } catch (error) {
        console.warn('[UserService] pickup bag count query failed:', error.message);
        pickupBagsError = error;
      }

      if (pickupBagsError) {
        console.error('[UserService] Error fetching pickup bag counts:', pickupBagsError);
      }

      const totalBags = pickupBags?.reduce((sum, pickup) => sum + (pickup.bag_count || 0), 0) || 0;

      // Use user_stats.total_bags as primary source, fallback to bag_inventory count
      const totalBagsFromStats = statsData?.total_bags || statsData?.total_bags_scanned || 0;
      const batchesFromStats = statsData?.scanned_batches?.length || 0;
      
      const userStats = {
        points: profileData?.points || 0,
        pickups: pickupCount || 0,
        reports: reportCount || 0,
        batches: Math.max(batchesFromStats, bagCount), // Use scanned_batches length or bag_inventory as fallback
        totalBags: Math.max(totalBagsFromStats, totalBags), // Use user_stats.total_bags or calculated total
        level: profileData?.level || 'Eco Starter',
        email: profileData?.email || '',
        firstName: profileData?.first_name || '',
        lastName: profileData?.last_name || '',
        avatar: profileData?.avatar_url || '',
      };

      console.log('[UserService] Successfully fetched user stats:', userStats);
      return { data: userStats, error: null };

    } catch (error) {
      console.error('[UserService] Error in getUserStats:', error);
      return { 
        data: null, 
        error: {
          message: error.message || 'Failed to fetch user stats',
          code: error.code || 'USER_STATS_ERROR'
        }
      };
    }
  },

  /**
   * Update user profile data
   * @param {string} userId - User ID
   * @param {Object} profileData - Profile data to update
   */
  async updateUserProfile(userId, profileData) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[UserService] Updating user profile for:', userId);

      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          ...profileData,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('[UserService] Error updating profile:', error);
        throw error;
      }

      console.log('[UserService] Successfully updated user profile');
      return { data, error: null };

    } catch (error) {
      console.error('[UserService] Error in updateUserProfile:', error);
      return { 
        data: null, 
        error: {
          message: error.message || 'Failed to update user profile',
          code: error.code || 'PROFILE_UPDATE_ERROR'
        }
      };
    }
  },

  /**
   * Create or update user stats entry
   * @param {string} userId - User ID
   * @param {Object} statsData - Stats data to update
   */
  async updateUserStats(userId, statsData) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[UserService] Updating user stats for:', userId);

      const { data, error } = await supabase
        .from('user_stats')
        .upsert({
          user_id: userId,
          ...statsData,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('[UserService] Error updating stats:', error);
        throw error;
      }

      console.log('[UserService] Successfully updated user stats');
      return { data, error: null };

    } catch (error) {
      console.error('[UserService] Error in updateUserStats:', error);
      return { 
        data: null, 
        error: {
          message: error.message || 'Failed to update user stats',
          code: error.code || 'STATS_UPDATE_ERROR'
        }
      };
    }
  }
};

export default userService;
