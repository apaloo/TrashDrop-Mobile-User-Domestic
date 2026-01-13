/**
 * Welcome Discount Service
 * Handles silent 4.5% discount on base price for first 5 requests from new users
 * 
 * IMPORTANT: This discount is applied silently - no breakdown shown to user
 * to prevent account farming when discounts expire.
 */

import supabase from '../utils/supabaseClient.js';

const WELCOME_DISCOUNT_RATE = 0.045; // 4.5%
const WELCOME_DISCOUNT_MAX_REQUESTS = 5;

/**
 * Check if user is eligible for welcome discount
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if eligible for welcome discount
 */
export const isEligibleForWelcomeDiscount = async (userId) => {
  if (!userId) return false;

  try {
    const { data, error } = await supabase
      .rpc('get_welcome_discount_multiplier', { p_user_id: userId });

    if (error) {
      console.warn('[WelcomeDiscount] Error checking eligibility:', error.message);
      return false;
    }

    return data > 0;
  } catch (error) {
    console.warn('[WelcomeDiscount] Exception checking eligibility:', error.message);
    return false;
  }
};

/**
 * Get the welcome discount multiplier for a user
 * @param {string} userId - User ID
 * @returns {Promise<number>} Discount multiplier (0.045 if eligible, 0 if not)
 */
export const getWelcomeDiscountMultiplier = async (userId) => {
  if (!userId) return 0;

  try {
    const { data, error } = await supabase
      .rpc('get_welcome_discount_multiplier', { p_user_id: userId });

    if (error) {
      console.warn('[WelcomeDiscount] Error getting multiplier:', error.message);
      return 0;
    }

    return parseFloat(data) || 0;
  } catch (error) {
    console.warn('[WelcomeDiscount] Exception getting multiplier:', error.message);
    return 0;
  }
};

/**
 * Calculate welcome discount amount based on base price
 * @param {string} userId - User ID
 * @param {number} basePrice - Base price before discount
 * @returns {Promise<number>} Discount amount in GHS (0 if not eligible)
 */
export const calculateWelcomeDiscount = async (userId, basePrice) => {
  if (!userId || !basePrice || basePrice <= 0) return 0;

  const multiplier = await getWelcomeDiscountMultiplier(userId);
  
  if (multiplier <= 0) return 0;

  const discount = basePrice * multiplier;
  return parseFloat(discount.toFixed(2));
};

/**
 * Get user's completed requests count (for internal use only)
 * @param {string} userId - User ID
 * @returns {Promise<number>} Number of completed requests
 */
export const getCompletedRequestsCount = async (userId) => {
  if (!userId) return 0;

  try {
    const { data, error } = await supabase
      .from('user_stats')
      .select('completed_requests_count')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[WelcomeDiscount] Error getting count:', error.message);
      return 0;
    }

    return data?.completed_requests_count || 0;
  } catch (error) {
    console.warn('[WelcomeDiscount] Exception getting count:', error.message);
    return 0;
  }
};

export default {
  isEligibleForWelcomeDiscount,
  getWelcomeDiscountMultiplier,
  calculateWelcomeDiscount,
  getCompletedRequestsCount,
  WELCOME_DISCOUNT_RATE,
  WELCOME_DISCOUNT_MAX_REQUESTS
};
