/**
 * Rewards service for handling rewards and redemptions database operations
 * Replaces rewards mock data with real Supabase queries
 */

import supabase from '../utils/supabaseClient.js';

export const rewardsService = {
  /**
   * Get available rewards
   * @returns {Array} Array of available rewards
   */
  async getAvailableRewards() {
    try {
      console.log('[RewardsService] Fetching available rewards');

      const { data, error } = await supabase
        .from('rewards')
        .select('*')
        .eq('is_active', true)
        .order('points_required', { ascending: true });

      if (error) {
        console.error('[RewardsService] Error fetching rewards:', error);
        throw error;
      }

      console.log(`[RewardsService] Found ${data?.length || 0} available rewards`);
      return { data: data || [], error: null };

    } catch (error) {
      console.error('[RewardsService] Error in getAvailableRewards:', error);
      return { 
        data: [], 
        error: {
          message: error.message || 'Failed to fetch available rewards',
          code: error.code || 'REWARDS_FETCH_ERROR'
        }
      };
    }
  },

  /**
   * Get user's reward redemption history
   * @param {string} userId - User ID
   * @param {number} limit - Number of records to fetch
   * @returns {Array} Array of redemption records
   */
  async getRedemptionHistory(userId, limit = 10) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[RewardsService] Fetching redemption history for:', userId);

      const { data, error } = await supabase
        .from('reward_redemptions')
        .select(`
          *,
          rewards (
            name,
            description,
            points_required,
            category
          )
        `)
        .eq('user_id', userId)
        .order('redemption_date', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[RewardsService] Error fetching redemption history:', error);
        throw error;
      }

      const formattedHistory = data?.map(redemption => ({
        id: redemption.id,
        reward_id: redemption.reward_id,
        reward_name: redemption.rewards?.name || 'Unknown Reward',
        reward_description: redemption.rewards?.description || '',
        points_used: redemption.points_used,
        status: redemption.status,
        redemption_date: redemption.redemption_date,
        created_at: redemption.created_at
      })) || [];

      console.log(`[RewardsService] Found ${formattedHistory.length} redemptions`);
      return { data: formattedHistory, error: null };

    } catch (error) {
      console.error('[RewardsService] Error in getRedemptionHistory:', error);
      return { 
        data: [], 
        error: {
          message: error.message || 'Failed to fetch redemption history',
          code: error.code || 'REDEMPTION_HISTORY_ERROR'
        }
      };
    }
  },

  /**
   * Redeem a reward for a user
   * @param {string} userId - User ID
   * @param {string} rewardId - Reward ID
   * @returns {Object} Redemption record
   */
  async redeemReward(userId, rewardId) {
    try {
      if (!userId || !rewardId) {
        throw new Error('User ID and Reward ID are required');
      }

      console.log('[RewardsService] Processing reward redemption:', { userId, rewardId });

      // First, get the reward details
      const { data: reward, error: rewardError } = await supabase
        .from('rewards')
        .select('*')
        .eq('id', rewardId)
        .single();

      if (rewardError) {
        console.error('[RewardsService] Error fetching reward details:', rewardError);
        throw rewardError;
      }

      if (!reward) {
        throw new Error('Reward not found');
      }

      // Check if reward is still active
      if (!reward.is_active) {
        throw new Error('Reward is no longer available');
      }

      // Get user's current points
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('points')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('[RewardsService] Error fetching user profile:', profileError);
        throw profileError;
      }

      const userPoints = profile?.points || 0;

      // Check if user has enough points
      if (userPoints < reward.points_required) {
        throw new Error(`Insufficient points. Required: ${reward.points_required}, Available: ${userPoints}`);
      }

      // Create redemption record
      const redemptionData = {
        user_id: userId,
        reward_id: rewardId,
        points_used: reward.points_required,
        status: 'pending',
        redemption_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: redemption, error: redemptionError } = await supabase
        .from('reward_redemptions')
        .insert(redemptionData)
        .select()
        .single();

      if (redemptionError) {
        console.error('[RewardsService] Error creating redemption record:', redemptionError);
        throw redemptionError;
      }

      // Deduct points from user profile
      const { error: pointsError } = await supabase
        .from('profiles')
        .update({
          points: userPoints - reward.points_required,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (pointsError) {
        console.error('[RewardsService] Error deducting points:', pointsError);
        // Try to rollback redemption record
        await supabase
          .from('reward_redemptions')
          .delete()
          .eq('id', redemption.id);
        throw pointsError;
      }

      console.log('[RewardsService] Successfully processed reward redemption:', redemption.id);
      return { data: redemption, error: null };

    } catch (error) {
      console.error('[RewardsService] Error in redeemReward:', error);
      return { 
        data: null, 
        error: {
          message: error.message || 'Failed to redeem reward',
          code: error.code || 'REWARD_REDEMPTION_ERROR'
        }
      };
    }
  },

  /**
   * Get reward categories
   * @returns {Array} Array of reward categories
   */
  async getRewardCategories() {
    try {
      console.log('[RewardsService] Fetching reward categories');

      const { data, error } = await supabase
        .from('rewards')
        .select('category')
        .eq('is_active', true);

      if (error) {
        console.error('[RewardsService] Error fetching categories:', error);
        throw error;
      }

      // Get unique categories
      const categories = [...new Set(data?.map(item => item.category).filter(Boolean))] || [];

      console.log(`[RewardsService] Found ${categories.length} categories`);
      return { data: categories, error: null };

    } catch (error) {
      console.error('[RewardsService] Error in getRewardCategories:', error);
      return { 
        data: [], 
        error: {
          message: error.message || 'Failed to fetch reward categories',
          code: error.code || 'CATEGORIES_FETCH_ERROR'
        }
      };
    }
  },

  /**
   * Get rewards by category
   * @param {string} category - Reward category
   * @returns {Array} Array of rewards in category
   */
  async getRewardsByCategory(category) {
    try {
      if (!category) {
        return await this.getAvailableRewards();
      }

      console.log('[RewardsService] Fetching rewards by category:', category);

      const { data, error } = await supabase
        .from('rewards')
        .select('*')
        .eq('category', category)
        .eq('is_active', true)
        .order('points_required', { ascending: true });

      if (error) {
        console.error('[RewardsService] Error fetching rewards by category:', error);
        throw error;
      }

      console.log(`[RewardsService] Found ${data?.length || 0} rewards in category: ${category}`);
      return { data: data || [], error: null };

    } catch (error) {
      console.error('[RewardsService] Error in getRewardsByCategory:', error);
      return { 
        data: [], 
        error: {
          message: error.message || 'Failed to fetch rewards by category',
          code: error.code || 'CATEGORY_REWARDS_ERROR'
        }
      };
    }
  }
};

export default rewardsService;
