/**
 * Digital Bin Service
 * Helper functions for digital bin creation and fee calculation
 */

import { getCostBreakdown } from '../utils/costCalculator.js';
import { calculateWelcomeDiscount } from './welcomeDiscountService.js';

/**
 * Prepare digital bin data with calculated fees (ASYNC for welcome discount)
 * @param {Object} params - Parameters for digital bin creation
 * @returns {Promise<Object>} Complete digital bin data ready for database insert
 */
export const prepareDigitalBinData = async ({
  user_id,
  location_id,
  qr_code_url,
  frequency,
  waste_type,
  bag_count,
  bin_size_liters,
  is_urgent,
  expires_at
}) => {
  // First, get base cost to calculate welcome discount
  const preliminaryBreakdown = getCostBreakdown({
    bin_size_liters,
    frequency,
    waste_type,
    is_urgent,
    bag_count,
    distance_km: 0,
    on_site_charges: 0,
    discount_amount: 0
  });

  // Calculate silent welcome discount (4.5% of base for first 5 requests)
  const welcomeDiscount = await calculateWelcomeDiscount(user_id, preliminaryBreakdown.base);

  // Calculate final cost breakdown with welcome discount applied silently
  const costBreakdown = getCostBreakdown({
    bin_size_liters,
    frequency,
    waste_type,
    is_urgent,
    bag_count,
    distance_km: 0, // Will be calculated when collector accepts
    on_site_charges: 0,
    discount_amount: welcomeDiscount // Silent welcome discount
  });

  console.log('[DigitalBinService] Calculated cost breakdown:', costBreakdown);

  // Prepare complete digital bin data with all fee fields
  const digitalBinData = {
    user_id,
    location_id,
    qr_code_url,
    frequency,
    waste_type,
    bag_count,
    bin_size_liters,
    is_urgent,
    expires_at,
    is_active: true,
    
    // Fee fields (SOP v4.5.6 compliant)
    fee: costBreakdown.total.toFixed(2),
    collector_core_payout: costBreakdown.core.toFixed(2),
    collector_urgent_payout: costBreakdown.urgent_charge.toFixed(2),
    collector_distance_payout: costBreakdown.distance_charge.toFixed(2),
    collector_surge_payout: '0.00', // Calculated server-side when accepted
    collector_tips: '0.00',
    collector_recyclables_payout: '0.00', // Calculated after collection
    collector_loyalty_cashback: '0.00',
    collector_total_payout: (
      costBreakdown.core + 
      costBreakdown.urgent_charge + 
      costBreakdown.distance_charge
    ).toFixed(2),
    surge_multiplier: '1.00',
    deadhead_km: '0.00' // Will be calculated when collector accepts
  };

  return digitalBinData;
};

export default {
  prepareDigitalBinData
};
