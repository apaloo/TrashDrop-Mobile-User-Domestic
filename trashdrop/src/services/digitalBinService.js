/**
 * Digital Bin Service
 * Helper functions for digital bin creation and fee calculation
 */

import { getCostBreakdownWithGPS } from '../utils/costCalculator.js';

/**
 * Shape a digital_bins row the way the bin list expects it.
 *
 * Rows reach the UI from three places - the joined server fetch, the optimistic
 * row added right after a create, and raw realtime payloads - and every one of
 * them has to end up with the same `status` vocabulary ('active' | 'completed' |
 * 'cancelled'). The database's own `status` starts at 'pending', which matches
 * none of the list's tabs, so anything skipping this mapping goes invisible.
 *
 * @param {Object} pickup - A digital_bins row, optionally with a bin_locations join
 * @returns {Object} Row with resolved location fields and a list-facing status
 */
export const transformBin = (pickup) => ({
  ...pickup,
  location_name: pickup.location_name || pickup.bin_locations?.location_name,
  address: pickup.address || pickup.bin_locations?.address,
  status: pickup.collected_at ? 'completed' :
          (pickup.status === 'completed' || pickup.status === 'disposed') ? 'completed' :
          pickup.is_active ? 'active' : 'cancelled'
});

/**
 * Prepare digital bin data with calculated fees (GPS-based pricing)
 * @param {Object} params - Parameters for digital bin creation
 * @returns {Promise<Object>} Complete digital bin data ready for database insert
 */
export const prepareDigitalBinData = async ({
  id,
  user_id,
  location_id,
  qr_code_url,
  frequency,
  waste_type,
  bag_count,
  bin_size_liters,
  is_urgent,
  expires_at,
  details,
  latitude,
  longitude,
  is_promotional = false,
  promo_request_number = null,
  promotional_client_fee = null,
  promotional_collector_payout = null,
  promotional_platform_subsidy = null
}) => {
  // --- Promotional pricing path (per bag, bypasses SOP pipeline) ---
  // Mirrors the database's td_price_digital_bin(), which sets the stored price
  // on insert: promotional rate × bags, never for urgent bookings.
  if (is_promotional && promotional_client_fee != null && !is_urgent) {
    console.log('[DigitalBinService] Promotional pricing applied:', {
      client_fee: promotional_client_fee,
      collector_payout: promotional_collector_payout,
      platform_subsidy: promotional_platform_subsidy,
      request_number: promo_request_number
    });

    const binCount = Math.max(1, parseInt(bag_count) || 1);
    const clientFee = parseFloat(promotional_client_fee) * binCount;
    const collectorPayout = parseFloat(promotional_collector_payout ?? promotional_client_fee) * binCount;

    return {
      id,
      user_id,
      location_id,
      qr_code_url,
      frequency,
      waste_type,
      bag_count,
      bin_size_liters,
      is_urgent,
      expires_at,
      details,
      is_active: true,
      status: 'pending',

      // Promotional fee fields
      fee: clientFee.toFixed(2),
      is_promotional: true,
      promo_request_number: promo_request_number,

      // Collector payout = collector_payout from schedule × bags
      collector_core_payout: collectorPayout.toFixed(2),
      collector_urgent_payout: '0.00',
      collector_distance_payout: '0.00',
      collector_surge_payout: '0.00',
      collector_tips: '0.00',
      collector_recyclables_payout: '0.00',
      collector_loyalty_cashback: '0.00',
      collector_total_payout: collectorPayout.toFixed(2),
      surge_multiplier: '1.00',
      deadhead_km: '0.00'
    };
  }

  // --- Standard SOP v4.5.6 pricing path ---
  // Priced from the zone covering the bin's location. There is no default
  // price: an uncovered or unpriceable location throws PricingUnavailableError,
  // whose message is shown to the user, and no bin is created.
  const costBreakdown = await getCostBreakdownWithGPS({
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

  console.log('[DigitalBinService] Calculated cost breakdown:', costBreakdown);

  // Prepare complete digital bin data with all fee fields
  const digitalBinData = {
    id,
    user_id,
    location_id,
    qr_code_url,
    frequency,
    waste_type,
    bag_count,
    bin_size_liters,
    is_urgent,
    expires_at,
    details,
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
  prepareDigitalBinData,
  transformBin
};
