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
        // Filter pickup requests by user_id (the person who created the request)
        // NOT collector_id (the person who will collect it)
        console.log('XXXXXXXXXXXXXXXXXXXXXX [UserService] Querying pickup_requests by user_id only (requester)');
        
        const result = await supabase
          .from('pickup_requests')
          .select('id', { count: 'exact' })
          .eq('user_id', userId)  // Only filter by user_id (pickup requester)
          .in('status', ['scheduled', 'accepted', 'available']);
        console.log('[UserService] Pickup requests query result:', result);
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
          .from('illegal_dumping_mobile')
          .select('id', { count: 'exact' })
          .eq('reported_by', userId);
        reportCount = result.count;
        reportError = result.error;
      } catch (error) {
        console.warn('[UserService] illegal_dumping_mobile table query failed:', error.message);
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

      // Total bags come from user_stats table only (bags obtained from batch scans)
      // Pickup requests represent bags being used/collected, not bags owned

      // Query batches table directly to get accurate bag counts
      let totalBagsFromBatches = 0;
      let batchesCount = 0;
      
      try {
        console.log('[UserService] 🔍 Querying batches table for user:', userId);
        console.log('[UserService] 🔍 User ID type:', typeof userId);
        console.log('[UserService] 🔍 User ID length:', userId?.length);
        console.log('[UserService] 🔍 Using created_by filter (correct field for batches)...');
        const { data: batchesData, error: batchesError } = await supabase
          .from('batches')
          .select('bag_count, created_by')
          .eq('created_by', userId);
        
        if (batchesError) {
          console.error('[UserService] ❌ Error querying batches table:', batchesError);
          console.error('[UserService] ❌ Error details:', {
            code: batchesError.code,
            message: batchesError.message,
            details: batchesError.details
          });
        } else {
          console.log('[UserService] ✅ Batches query successful');
          console.log('[UserService] 📊 Raw batches data:', batchesData);
          console.log('[UserService] 📊 Batches data type:', typeof batchesData);
          console.log('[UserService] 📊 Batches data length:', batchesData?.length);
          console.log('[UserService] 📊 Is array?', Array.isArray(batchesData));
          
          if (batchesData && Array.isArray(batchesData)) {
            console.log('[UserService] ✅ Found batches:', batchesData.length);
            batchesCount = batchesData.length;
            
            if (batchesData.length > 0) {
              console.log('[UserService] 🔢 Calculating bags from batches:', batchesData);
              totalBagsFromBatches = batchesData.reduce((sum, batch, index) => {
                const batchBags = batch?.bag_count || 0;
                console.log(`[UserService] 📦 Batch ${index}: ${batchBags} bags (from bag_count column)`);
                return sum + batchBags;
              }, 0);
              console.log('[UserService] 🎯 Total bags calculated:', totalBagsFromBatches);
            } else {
              console.log('[UserService] ⚠️ No batches found for user');
            }
          } else {
            console.log('[UserService] ⚠️ Batches data is not an array:', typeof batchesData, batchesData);
          }
        }
      } catch (error) {
        console.error('[UserService] ❌ Exception fetching batches:', error);
      }
      
      // Use ONLY batches table data - no fallback to user_stats
      const totalBagsFromStats = totalBagsFromBatches;
      const batchesFromStats = batchesCount;
      
      // Debug output to verify data mapping
      console.log('[UserService] User stats calculation:', {
        'batches_table.count': batchesCount,
        'batches_table.total_bags': totalBagsFromBatches,
        'user_stats.total_batches': statsData?.total_batches,
        'user_stats.scanned_batches': statsData?.scanned_batches,
        'user_stats.available_bags': statsData?.available_bags,
        'user_stats.total_bags': statsData?.total_bags,
        'final_batches_count': batchesFromStats,
        'final_bags_count': totalBagsFromStats,
        'bag_inventory_count': bagCount
      });
      
      const userStats = {
        points: profileData?.points || 0,
        pickups: pickupCount || 0,
        reports: reportCount || 0,
        batches: batchesFromStats, // Direct from batches table only
        totalBags: totalBagsFromStats, // Direct from batches table only
        available_bags: statsData?.available_bags || 0, // Available bags from user_stats
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
