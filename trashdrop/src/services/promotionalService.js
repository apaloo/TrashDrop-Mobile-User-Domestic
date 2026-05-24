/**
 * Promotional Pricing Service
 * Handles promotional usage eligibility checks, fee lookups,
 * and usage tracking for the TrashDrop client app.
 *
 * DB prerequisites:
 *   - `promotional_usage` row created per user (via DB trigger on auth.users INSERT)
 *   - `promotional_fee_schedule` seeded with active rows per bin size
 *   - `increment_promotional_usage` RPC deployed to Supabase
 */

import supabase from '../utils/supabaseClient.js';

/**
 * Check whether a user is eligible for promotional pricing.
 *
 * @param {string} userId - auth user id
 * @returns {Promise<{isEligible: boolean, usedCount: number, maxRequests: number}>}
 */
export const checkPromotionalEligibility = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('promotional_usage')
      .select('is_eligible, used_count, max_requests')
      .eq('user_id', userId)
      .single();

    if (error) {
      // No row found means the user was created before the trigger existed
      console.warn('[PromoService] Eligibility check failed:', error.message);
      return { isEligible: false, usedCount: 0, maxRequests: 0 };
    }

    return {
      isEligible: data?.is_eligible ?? false,
      usedCount: data?.used_count ?? 0,
      maxRequests: data?.max_requests ?? 5
    };
  } catch (err) {
    console.error('[PromoService] Unexpected error checking eligibility:', err);
    return { isEligible: false, usedCount: 0, maxRequests: 0 };
  }
};

/**
 * Fetch the promotional client fee for a given bin size.
 *
 * @param {number} binSizeLiters - e.g. 120, 240, 360
 * @returns {Promise<{clientFee: number|null, collectorPayout: number|null, platformSubsidy: number|null}>}
 */
export const getPromotionalFee = async (binSizeLiters) => {
  try {
    const { data, error } = await supabase
      .from('promotional_fee_schedule')
      .select('client_fee, collector_payout, platform_subsidy')
      .eq('bin_size_liters', binSizeLiters)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      console.warn('[PromoService] No promotional fee found for', binSizeLiters, 'L:', error?.message);
      return { clientFee: null, collectorPayout: null, platformSubsidy: null };
    }

    return {
      clientFee: parseFloat(data.client_fee),
      collectorPayout: parseFloat(data.collector_payout),
      platformSubsidy: data.platform_subsidy != null ? parseFloat(data.platform_subsidy) : null
    };
  } catch (err) {
    console.error('[PromoService] Unexpected error fetching promo fee:', err);
    return { clientFee: null, collectorPayout: null, platformSubsidy: null };
  }
};

/**
 * Fetch ALL active promotional fees (for displaying a comparison banner).
 *
 * @returns {Promise<Array<{binSizeLiters: number, clientFee: number, collectorPayout: number}>>}
 */
export const getAllPromotionalFees = async () => {
  try {
    const { data, error } = await supabase
      .from('promotional_fee_schedule')
      .select('bin_size_liters, client_fee, collector_payout')
      .eq('is_active', true)
      .order('bin_size_liters', { ascending: true });

    if (error || !data) {
      console.warn('[PromoService] Failed to fetch all promo fees:', error?.message);
      return [];
    }

    return data.map(row => ({
      binSizeLiters: row.bin_size_liters,
      clientFee: parseFloat(row.client_fee),
      collectorPayout: parseFloat(row.collector_payout)
    }));
  } catch (err) {
    console.error('[PromoService] Unexpected error fetching all promo fees:', err);
    return [];
  }
};

/**
 * Atomically increment promotional usage via RPC.
 * Returns true if the increment succeeded (user was still eligible),
 * false if the user has exhausted their promotional requests or no row exists.
 *
 * @param {string} userId - auth user id
 * @returns {Promise<boolean>}
 */
export const incrementPromotionalUsage = async (userId) => {
  try {
    const { data, error } = await supabase.rpc('increment_promotional_usage', {
      p_user_id: userId
    });

    if (error) {
      console.error('[PromoService] RPC increment_promotional_usage failed:', error.message);
      return false;
    }

    console.log('[PromoService] Promotional usage incremented:', data);
    return data === true;
  } catch (err) {
    console.error('[PromoService] Unexpected error incrementing usage:', err);
    return false;
  }
};

export default {
  checkPromotionalEligibility,
  getPromotionalFee,
  getAllPromotionalFees,
  incrementPromotionalUsage
};
