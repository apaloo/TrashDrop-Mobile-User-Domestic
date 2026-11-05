/**
 * User service for handling user-related database operations
 * Replaces mock data with real Supabase queries
 */

import supabase from '../utils/supabaseClient.js';
import { reportPoints } from '../utils/reportPoints.js';

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

      // Every lookup is independent, so they run at the same time (they used
      // to run one after another: ~9 round trips before the page could show).
      // The profile photo is not fetched: no caller needs it here, and old
      // photos stored as text can be close to 2 MB.
      const settle = (query) => Promise.resolve(query).catch((error) => ({ data: null, error }));
      const [
        profileResult,
        statsResult,
        pickupsResult,
        binsResult,
        reportsResult,
        bagsResult,
        batchesResult,
        redemptionsResult,
        scansResult,
      ] = await Promise.all([
        settle(supabase.from('profiles').select('id, points, level, email, first_name, last_name').eq('id', userId).maybeSingle()),
        settle(supabase.from('user_stats').select('*').eq('user_id', userId).maybeSingle()),
        // Requests the user made (user_id), not ones they collect
        settle(supabase.from('pickup_requests').select('id, points_earned', { count: 'exact' }).eq('user_id', userId)),
        settle(supabase.from('digital_bins').select('id', { count: 'exact' }).eq('user_id', userId)),
        settle(supabase.from('illegal_dumping_mobile').select('id, severity, status, created_at', { count: 'exact' }).eq('reported_by', userId)),
        settle(supabase.from('bag_inventory').select('id', { count: 'exact' }).eq('user_id', userId)),
        settle(supabase.from('batches').select('bag_count, created_by').eq('created_by', userId)),
        settle(supabase.from('rewards_redemption').select('points_spent, status', { count: 'exact' }).eq('user_id', userId)),
        settle(supabase.from('user_activity').select('id, points_impact', { count: 'exact' }).eq('user_id', userId).eq('activity_type', 'qr_scan')),
      ]);

      if (profileResult.error && profileResult.error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('[UserService] Error fetching profile:', profileResult.error);
        throw profileResult.error;
      }
      [statsResult, pickupsResult, binsResult, reportsResult, bagsResult, batchesResult, redemptionsResult, scansResult]
        .forEach((r) => { if (r.error && r.error.code !== 'PGRST116') console.warn('[UserService] Stats lookup failed:', r.error.message || r.error); });

      const profileData = profileResult.data;
      const statsData = statsResult.data;
      const rows = (r) => (Array.isArray(r.data) ? r.data : []);

      // Points from pickup requests (single source of truth for pickups)
      const totalPointsFromPickups = rows(pickupsResult).reduce((sum, pickup) => sum + (pickup.points_earned || 0), 0);
      // Digital bins earn 15 points each, and count as pickups for display
      const digitalBinCount = binsResult.count || 0;
      const totalPointsFromDigitalBins = rows(binsResult).length * 15;
      const pickupCount = (pickupsResult.count || 0) + digitalBinCount;
      // high=20, medium=15, low=10, once the report is verified (utils/reportPoints)
      const totalPointsFromReports = rows(reportsResult).reduce((sum, report) => sum + reportPoints(report), 0);
      const reportCount = reportsResult.count;
      const bagCount = bagsResult.count;
      // Bags come from the batches table only
      const batchesCount = rows(batchesResult).length;
      const totalBagsFromBatches = rows(batchesResult).reduce((sum, batch) => sum + (batch?.bag_count || 0), 0);
      // A rejected redemption gives its points back
      const totalPointsSpent = rows(redemptionsResult)
        .filter(redemption => redemption.status !== 'rejected')
        .reduce((sum, redemption) => sum + (redemption.points_spent || 0), 0);
      // QR scans earn 5 points each unless the row says otherwise
      const totalPointsFromScans = rows(scansResult).reduce((sum, scan) => sum + (scan.points_impact || 5), 0);

      // Total points from all sources (earned - spent)
      const totalPoints = totalPointsFromPickups + totalPointsFromDigitalBins + totalPointsFromReports + totalPointsFromScans - totalPointsSpent;

      console.log('[UserService] User stats:', {
        pickups: totalPointsFromPickups,
        digitalBins: totalPointsFromDigitalBins,
        reports: totalPointsFromReports,
        qrScans: totalPointsFromScans,
        spent: totalPointsSpent,
        total: totalPoints,
        batches: batchesCount,
        bags: totalBagsFromBatches,
        bagInventory: bagCount,
      });

      const userStats = {
        points: totalPoints,
        pickups: pickupCount || 0,
        reports: reportCount || 0,
        batches: batchesCount, // Direct from batches table only
        totalBags: totalBagsFromBatches, // Direct from batches table only
        available_bags: statsData?.available_bags || 0, // Available bags from user_stats
        level: profileData?.level || 'Eco Starter',
        email: profileData?.email || '',
        firstName: profileData?.first_name || '',
        lastName: profileData?.last_name || '',
      };

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

      // Use upsert to create profile if it doesn't exist or update if it does
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
        console.error('[UserService] Error upserting profile:', error);
        throw error;
      }

      console.log('[UserService] Successfully upserted user profile');
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
