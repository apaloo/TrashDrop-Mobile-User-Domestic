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
        balanceResult,
      ] = await Promise.all([
        settle(supabase.from('profiles').select('id, points, level, email, first_name, last_name').eq('id', userId).maybeSingle()),
        settle(supabase.from('user_stats').select('*').eq('user_id', userId).maybeSingle()),
        // Requests the user made (user_id), not ones they collect
        settle(supabase.from('pickup_requests').select('id, points_earned, status').eq('user_id', userId)),
        settle(supabase.from('digital_bins').select('id, status').eq('user_id', userId)),
        settle(supabase.from('illegal_dumping_mobile').select('id, severity, status, created_at', { count: 'exact' }).eq('reported_by', userId)),
        settle(supabase.from('bag_inventory').select('id', { count: 'exact' }).eq('user_id', userId)),
        settle(supabase.from('batches').select('bag_count, created_by').eq('created_by', userId)),
        settle(supabase.from('rewards_redemption').select('points_spent, status', { count: 'exact' }).eq('user_id', userId)),
        // The balance the server checks when a reward is redeemed (docs/POINTS.md)
        settle(supabase.from('user_stats_dashboard').select('total_points, total_pickups').eq('user_id', userId).maybeSingle()),
      ]);

      if (profileResult.error && profileResult.error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('[UserService] Error fetching profile:', profileResult.error);
        throw profileResult.error;
      }
      [statsResult, pickupsResult, binsResult, reportsResult, bagsResult, batchesResult, redemptionsResult, balanceResult]
        .forEach((r) => { if (r.error && r.error.code !== 'PGRST116') console.warn('[UserService] Stats lookup failed:', r.error.message || r.error); });

      const profileData = profileResult.data;
      const statsData = statsResult.data;
      const rows = (r) => (Array.isArray(r.data) ? r.data : []);

      // Cancelled or rejected pickups and bins earn nothing and aren't counted
      const counts = (item) => !['cancelled', 'canceled', 'rejected'].includes(String(item?.status || '').toLowerCase());
      const pickups = rows(pickupsResult).filter(counts);
      const bins = rows(binsResult).filter(counts);
      const totalPointsFromPickups = pickups.reduce((sum, pickup) => sum + (pickup.points_earned || 0), 0);
      // Digital bins earn 15 points each, and count as pickups
      const totalPointsFromDigitalBins = bins.length * 15;
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

      // The server's balance is the one a redemption is checked against, so
      // show it. If it can't be read, work it out with the same rules.
      const server = balanceResult.data;
      const totalPoints = typeof server?.total_points === 'number'
        ? server.total_points
        : (profileData?.points || 0) + totalPointsFromPickups + totalPointsFromDigitalBins + totalPointsFromReports - totalPointsSpent;
      const pickupCount = typeof server?.total_pickups === 'number' ? server.total_pickups : pickups.length + bins.length;

      console.log('[UserService] User stats:', {
        pickups: totalPointsFromPickups,
        digitalBins: totalPointsFromDigitalBins,
        reports: totalPointsFromReports,
        fromServer: typeof server?.total_points === 'number',
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

};

export default userService;
