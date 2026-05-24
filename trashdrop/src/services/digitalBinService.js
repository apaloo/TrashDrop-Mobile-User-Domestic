/**
 * Digital Bin Service
 * Helper functions for digital bin creation and fee calculation
 */

import { getCostBreakdown, getCostBreakdownWithGPS } from '../utils/costCalculator.js';

/**
 * Prepare digital bin data with calculated fees (GPS-based pricing)
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
  expires_at,
  latitude,
  longitude,
  is_promotional = false,
  promo_request_number = null,
  promotional_client_fee = null,
  promotional_collector_payout = null,
  promotional_platform_subsidy = null
}) => {
  // --- Promotional pricing path (flat fee, bypasses SOP pipeline) ---
  if (is_promotional && promotional_client_fee != null) {
    console.log('[DigitalBinService] Promotional pricing applied:', {
      client_fee: promotional_client_fee,
      collector_payout: promotional_collector_payout,
      platform_subsidy: promotional_platform_subsidy,
      request_number: promo_request_number
    });

    const collectorPayout = promotional_collector_payout ?? promotional_client_fee;

    return {
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
      status: 'pending',

      // Promotional fee fields
      fee: parseFloat(promotional_client_fee).toFixed(2),
      is_promotional: true,
      promo_request_number: promo_request_number,

      // Collector payout = full collector_payout from schedule
      collector_core_payout: parseFloat(collectorPayout).toFixed(2),
      collector_urgent_payout: '0.00',
      collector_distance_payout: '0.00',
      collector_surge_payout: '0.00',
      collector_tips: '0.00',
      collector_recyclables_payout: '0.00',
      collector_loyalty_cashback: '0.00',
      collector_total_payout: parseFloat(collectorPayout).toFixed(2),
      surge_multiplier: '1.00',
      deadhead_km: '0.00'
    };
  }

  // --- Standard SOP v4.5.6 pricing path ---
  // Calculate cost breakdown using GPS-based pricing (SOP v4.5.7)
  let costBreakdown;
  
  if (latitude && longitude) {
    // Use GPS-based pricing
    costBreakdown = await getCostBreakdownWithGPS({
      bin_size_liters,
      latitude,
      longitude,
      frequency,
      waste_type,
      is_urgent,
      bag_count,
      distance_km: 0, // Will be calculated when collector accepts
      on_site_charges: 0,
      discount_amount: 0
    });
    console.log('[DigitalBinService] GPS pricing used:', costBreakdown.pricing_source, costBreakdown.pricing_zone);
  } else {
    // Fallback to default pricing
    costBreakdown = getCostBreakdown({
      bin_size_liters,
      frequency,
      waste_type,
      is_urgent,
      bag_count,
      distance_km: 0,
      on_site_charges: 0,
      discount_amount: 0
    });
    console.log('[DigitalBinService] Default pricing used (no GPS coordinates)');
  }

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
    status: 'pending', // Set initial status to comply with constraint
    is_promotional: false,
    
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
