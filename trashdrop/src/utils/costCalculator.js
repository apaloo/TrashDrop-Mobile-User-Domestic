/**
 * Cost Calculator for Digital Bin Services (SOP v4.5.6)
 * Calculates estimated collection costs based on bin size, frequency, waste type, and urgency
 * 
 * IMPORTANT: This provides CLIENT-SIDE ESTIMATES ONLY.
 * Final pricing is calculated SERVER-SIDE via /api/digital-bins/quote endpoint.
 * 
 * Pricing Order (SOP v4.5.6):
 * Base → On-site → Discounts (max 80%) → Urgent (30% of Base) → 
 * Distance (>5-10km, Urgent only) → Surge (hidden from user) → Request fee (₵1) → Taxes
 * 
 * GPS-BASED PRICING (v4.5.7):
 * A booking's base price comes only from the pricing zone covering its
 * location (getCostBreakdownWithGPS). There is no fallback: a location outside
 * coverage, an unpriced size or a failed lookup throws PricingUnavailableError.
 * BASE_COSTS below feeds the synchronous estimate helpers only and is never
 * used to price a booking.
 */

import gpsPricingService, { PricingUnavailableError } from '../services/gpsPricingService.js';

export { PricingUnavailableError };

/**
 * Available bin sizes in liters
 */
export const BIN_SIZES = [60, 80, 90, 100, 120, 240, 340, 360, 660, 1100];

/**
 * Base cost mapping by bin size (in GHS - Ghana Cedis)
 * These are weekly base rates - ACTUAL PRICING
 */
const BASE_COSTS = {
  60: 15,    // Extra Small
  80: 18,    // Small
  90: 22,    // Small
  100: 25,   // Medium
  120: 30,   // Standard (Recommended)
  240: 40,   // Large
  340: 55,   // Extra Large
  360: 60,   // Extra Large
  660: 85,   // Industrial
  1100: 120  // Commercial
};

/**
 * Frequency discount multipliers (OPTIONAL - City-level feature)
 * Less frequent service = lower total cost
 * NOTE: Not in core SOP v4.5.6; can be used as promotional discounts
 */
const FREQUENCY_MULTIPLIERS = {
  weekly: 1.0,      // No discount for weekly
  biweekly: 0.9,    // 10% discount for bi-weekly
  monthly: 0.8      // 20% discount for monthly
};

/**
 * Waste type adjustment multipliers (OPTIONAL - City-level feature)
 * NOTE: Not in core SOP v4.5.6; recyclables handled via separate 60/25/15 split post-pickup
 */
const WASTE_TYPE_MULTIPLIERS = {
  general: 1.0,     // Standard rate
  recycling: 0.9,   // 10% cheaper (easier to process)
  organic: 1.1      // 10% more expensive (requires special handling)
};

/**
 * SOP v4.5.6 Constants
 */

// Urgent priority surcharge (SOP v4.5.6: 30% of Base)
const URGENT_SURCHARGE = 0.30; // Was 0.10 in v4.5.5

// Request fee per pickup (SOP v4.5.6)
const REQUEST_FEE = 1.0; // ₵1 per request (GHS)

// Distance billing thresholds (Urgent only)
const DISTANCE_THRESHOLD_KM = 5; // Free up to 5 km
const DISTANCE_CAP_KM = 10; // Max billable distance
const DISTANCE_RATE_MULTIPLIER = 0.06; // 0.06 × Base per km (derived: 20% of 30% urgent)

// Discount cap (SOP v4.5.6: max 80% of Core)
const DISCOUNT_CAP_PERCENTAGE = 0.80;

/**
 * Get user-friendly label for bin size
 * 
 * @param {number} liters - Bin size in liters
 * @returns {string} Formatted label with size category
 * 
 * @example
 * getBinSizeLabel(120);
 * // Returns: "120L - Standard (Recommended)"
 */
export const getBinSizeLabel = (liters) => {
  const labels = {
    60: 'Extra Small',
    80: 'Small',
    90: 'Small',
    100: 'Medium',
    120: 'Standard (Recommended)',
    240: 'Large',
    340: 'Extra Large',
    360: 'Extra Large',
    660: 'Industrial',
    1100: 'Commercial'
  };

  const label = labels[liters] || 'Standard';
  return `${liters}L - ${label}`;
};

/**
 * Get short label for bin size (for compact displays)
 * 
 * @param {number} liters - Bin size in liters
 * @returns {string} Short formatted label
 * 
 * @example
 * getBinSizeLabelShort(120);
 * // Returns: "120L"
 */
export const getBinSizeLabelShort = (liters) => {
  return `${liters}L`;
};

/**
 * Format currency value in GHS
 * 
 * @param {number} amount - Amount in GHS
 * @returns {string} Formatted currency string
 * 
 * @example
 * formatCurrency(30.00);
 * // Returns: "GH₵ 30.00"
 */
export const formatCurrency = (amount) => {
  return `GH₵ ${parseFloat(amount).toFixed(2)}`;
};

/**
 * ============================================================================
 * GPS-BASED PRICING FUNCTIONS (v4.5.7)
 * These async functions use location-specific pricing when coordinates are provided.
 * They fall back to default BASE_COSTS if no GPS zone is found.
 * ============================================================================
 */

/**
 * Get cost breakdown with GPS-based pricing (ASYNC)
 * 
 * 
 * Base pricing comes from the pricing zone covering the location.
 * 
 * @param {Object} params - Bin service parameters
 * @param {number} params.bin_size_liters - Size of bin in liters
 * @param {number} params.latitude - GPS latitude (required)
 * @param {number} params.longitude - GPS longitude (required)
 * @param {string} params.frequency - Service frequency
 * @param {string} params.waste_type - Type of waste
 * @param {boolean} params.is_urgent - Whether request is urgent
 * @param {number} params.bag_count - Number of bins
 * @param {number} params.distance_km - Distance for urgent charge
 * @param {number} params.on_site_charges - Additional on-site charges
 * @param {number} params.discount_amount - Discount amount
 * @returns {Promise<Object>} Cost breakdown with GPS pricing info
 * @throws {PricingUnavailableError} when the location or bin size cannot be priced
 */
export const getCostBreakdownWithGPS = async ({
  bin_size_liters,
  latitude = null,
  longitude = null,
  frequency = 'weekly',
  waste_type = 'general',
  is_urgent = false,
  bag_count = 1,
  distance_km = 0,
  on_site_charges = 0,
  discount_amount = 0
}) => {
  const binCount = Math.max(1, parseInt(bag_count) || 1);
  
  // Base cost from the covering zone only; PricingUnavailableError propagates
  // to the caller, which must not quote or save the booking
  const priceInfo = await gpsPricingService.getLocationPrice(latitude, longitude, bin_size_liters);
  const baseCost = priceInfo.price;
  const pricingSource = priceInfo.source;
  const pricingZone = priceInfo.zone;
  console.log('[CostCalculator] GPS pricing used:', baseCost, 'GHS from', pricingZone?.suburb);

  const base = baseCost * binCount;

  // Core = Base + On-site - Discounts (capped at 80%)
  const coreBeforeDiscount = base + on_site_charges;
  const maxDiscount = coreBeforeDiscount * DISCOUNT_CAP_PERCENTAGE;
  const appliedDiscount = Math.min(discount_amount, maxDiscount);
  const core = Math.max(0, coreBeforeDiscount - appliedDiscount);

  // Urgent surcharge (30% of base, not core)
  const urgentCharge = is_urgent ? (base * URGENT_SURCHARGE) : 0;

  // Distance charge (Urgent only, >5-10km)
  let distanceCharge = 0;
  if (is_urgent && distance_km > DISTANCE_THRESHOLD_KM) {
    const billableKm = Math.max(0, Math.min(distance_km, DISTANCE_CAP_KM) - DISTANCE_THRESHOLD_KM);
    const perKmRate = DISTANCE_RATE_MULTIPLIER * base;
    distanceCharge = billableKm * perKmRate;
  }

  // Request fee
  const requestFee = REQUEST_FEE;

  // Subtotal
  const subtotal = core + urgentCharge + distanceCharge;

  // Total
  const total = subtotal + requestFee;

  return {
    base: parseFloat(base.toFixed(2)),
    base_per_bin: parseFloat(baseCost.toFixed(2)),
    bin_count: binCount,
    on_site_charges: parseFloat(on_site_charges.toFixed(2)),
    discount_applied: parseFloat(appliedDiscount.toFixed(2)),
    core: parseFloat(core.toFixed(2)),
    urgent_charge: parseFloat(urgentCharge.toFixed(2)),
    distance_charge: parseFloat(distanceCharge.toFixed(2)),
    distance_km: distance_km,
    billable_km: is_urgent ? Math.max(0, Math.min(distance_km, DISTANCE_CAP_KM) - DISTANCE_THRESHOLD_KM) : 0,
    request_fee: requestFee,
    subtotal: parseFloat(subtotal.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
    
    // GPS pricing info
    pricing_source: pricingSource,
    pricing_zone: pricingZone,
    
    // Display flags (hide if 0)
    display: {
      urgent_charge: urgentCharge > 0,
      distance_charge: distanceCharge > 0,
      on_site_charges: on_site_charges > 0,
      discount: appliedDiscount > 0,
      gps_pricing: pricingSource === 'gps'
    }
  };
};

// Default export with all functions
export default {
  BIN_SIZES,
  getBinSizeLabel,
  getBinSizeLabelShort,
  getCostBreakdownWithGPS,    // Async version (uses GPS pricing when available)
  formatCurrency
};
