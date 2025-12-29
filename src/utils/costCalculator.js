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
 */

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
 * Calculate PRELIMINARY estimate (CLIENT-SIDE ONLY)
 * 
 * ⚠️ IMPORTANT: This is for quick preview during form entry.
 * Final accurate pricing MUST be fetched from server via /api/digital-bins/quote
 * 
 * @param {Object} params - Bin service parameters
 * @param {number} params.bin_size_liters - Size of bin in liters (required)
 * @param {boolean} params.is_urgent - Whether request is urgent (default: false)
 * @param {number} params.bag_count - Number of bins (default: 1)
 * @returns {Object} Estimated cost breakdown (NOT binding)
 * 
 * @example
 * getEstimatedCost({ bin_size_liters: 120, is_urgent: true, bag_count: 1 });
 * // Returns: { estimated: 40.00, disclaimer: "..." }
 */
export const getEstimatedCost = ({
  bin_size_liters,
  is_urgent = false,
  bag_count = 1
}) => {
  // Validate bin size
  if (!bin_size_liters || !BIN_SIZES.includes(bin_size_liters)) {
    console.warn(`Invalid bin size: ${bin_size_liters}. Using default 120L.`);
    bin_size_liters = 120;
  }

  const binCount = Math.max(1, parseInt(bag_count) || 1);
  const base = (BASE_COSTS[bin_size_liters] || BASE_COSTS[120]) * binCount;
  const urgentCharge = is_urgent ? (base * URGENT_SURCHARGE) : 0;
  const requestFee = REQUEST_FEE;
  
  const estimated = base + urgentCharge + requestFee;

  return {
    estimated: parseFloat(estimated.toFixed(2)),
    disclaimer: 'Estimate only. Final price shown at review.',
    breakdown: {
      base: parseFloat(base.toFixed(2)),
      urgent_charge: parseFloat(urgentCharge.toFixed(2)),
      request_fee: requestFee
    }
  };
};

/**
 * LEGACY: Calculate estimated cost (DEPRECATED - use getEstimatedCost)
 * 
 * ⚠️ Kept for backward compatibility. New code should use getEstimatedCost().
 * 
 * @deprecated Use getEstimatedCost() for simple estimates or server API for accurate pricing
 */
export const calculateBinCost = ({
  bin_size_liters,
  frequency = 'weekly',
  waste_type = 'general',
  is_urgent = false,
  bag_count = 1
}) => {
  // Validate bin size
  if (!bin_size_liters || !BIN_SIZES.includes(bin_size_liters)) {
    console.warn(`Invalid bin size: ${bin_size_liters}. Using default 120L.`);
    bin_size_liters = 120;
  }

  // Get base cost
  let cost = BASE_COSTS[bin_size_liters] || BASE_COSTS[120];

  // Apply frequency discount (optional city feature)
  const frequencyMultiplier = FREQUENCY_MULTIPLIERS[frequency] || 1.0;
  cost *= frequencyMultiplier;

  // Apply waste type adjustment (optional city feature)
  const wasteTypeMultiplier = WASTE_TYPE_MULTIPLIERS[waste_type] || 1.0;
  cost *= wasteTypeMultiplier;

  // Apply urgent surcharge (SOP v4.5.6: 30% of base)
  if (is_urgent) {
    cost *= (1 + URGENT_SURCHARGE);
  }

  // Multiply by number of bins
  const binCount = Math.max(1, parseInt(bag_count) || 1);
  cost *= binCount;

  // Add request fee
  cost += REQUEST_FEE;

  // Round to 2 decimal places
  return parseFloat(cost.toFixed(2));
};

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
 * Get cost breakdown details (SOP v4.5.6 compliant)
 * 
 * ⚠️ CLIENT-SIDE ESTIMATE - Server should provide final breakdown
 * 
 * @param {Object} params - Bin service parameters
 * @returns {Object} Breakdown object with line items
 * 
 * @example
 * getCostBreakdown({ bin_size_liters: 120, is_urgent: true, bag_count: 1 });
 * // Returns: {
 * //   base: 30.00,
 * //   urgent_charge: 9.00,  // 30% of base
 * //   request_fee: 1.00,
 * //   total: 40.00,
 * //   display: { urgent_charge: true, ... }
 * // }
 */
export const getCostBreakdown = ({
  bin_size_liters,
  frequency = 'weekly',
  waste_type = 'general',
  is_urgent = false,
  bag_count = 1,
  distance_km = 0,  // For estimates only; real value from server
  on_site_charges = 0,
  discount_amount = 0
}) => {
  const binCount = Math.max(1, parseInt(bag_count) || 1);
  const baseCost = BASE_COSTS[bin_size_liters] || BASE_COSTS[120];
  const base = baseCost * binCount;

  // Core = Base + On-site - Discounts (capped at 80%)
  const coreBeforeDiscount = base + on_site_charges;
  const maxDiscount = coreBeforeDiscount * DISCOUNT_CAP_PERCENTAGE;
  const appliedDiscount = Math.min(discount_amount, maxDiscount);
  const core = Math.max(0, coreBeforeDiscount - appliedDiscount);

  // Urgent surcharge (30% of base, not core)
  const urgentCharge = is_urgent ? (base * URGENT_SURCHARGE) : 0;

  // Distance charge (Urgent only, >5-10km) - ESTIMATE
  // Real value should come from server with actual collector distance
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

  // Total (no surge on client-side; server adds surge)
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
    
    // Display flags (hide if 0)
    display: {
      urgent_charge: urgentCharge > 0,
      distance_charge: distanceCharge > 0,
      on_site_charges: on_site_charges > 0,
      discount: appliedDiscount > 0
    }
  };
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
 * Get recommended bin size based on household size
 * This is a simple recommendation algorithm
 * 
 * @param {number} householdSize - Number of people in household
 * @returns {number} Recommended bin size in liters
 * 
 * @example
 * getRecommendedBinSize(4);
 * // Returns: 120
 */
export const getRecommendedBinSize = (householdSize) => {
  if (householdSize <= 1) return 60;
  if (householdSize <= 2) return 80;
  if (householdSize <= 4) return 120;
  if (householdSize <= 6) return 240;
  return 340;
};

/**
 * Calculate distance charge (Urgent only, >5-10km)
 * Per SOP v4.5.6: Only billed when Urgent is ON
 * 
 * @param {number} base - Base cost for bins
 * @param {number} distanceKm - Collector distance in km
 * @param {boolean} isUrgent - Whether pickup is urgent
 * @returns {number} Distance charge in GHS
 */
export const calculateDistanceCharge = (base, distanceKm, isUrgent) => {
  if (!isUrgent || distanceKm <= DISTANCE_THRESHOLD_KM) {
    return 0;
  }
  
  const billableKm = Math.max(
    0, 
    Math.min(distanceKm, DISTANCE_CAP_KM) - DISTANCE_THRESHOLD_KM
  );
  
  const perKmRate = DISTANCE_RATE_MULTIPLIER * base; // 0.06 × Base
  return parseFloat((billableKm * perKmRate).toFixed(2));
};

/**
 * SOP v4.5.6 Constants Export
 * For use in server-side validation
 */
export const SOP_CONSTANTS = {
  URGENT_SURCHARGE,
  REQUEST_FEE,
  DISTANCE_THRESHOLD_KM,
  DISTANCE_CAP_KM,
  DISTANCE_RATE_MULTIPLIER,
  DISCOUNT_CAP_PERCENTAGE,
  VERSION: '4.5.6'
};

// Default export with all functions
export default {
  BIN_SIZES,
  calculateBinCost,           // Legacy (deprecated)
  getEstimatedCost,           // New: Simple client-side estimate
  getBinSizeLabel,
  getBinSizeLabelShort,
  getCostBreakdown,
  calculateDistanceCharge,
  formatCurrency,
  getRecommendedBinSize,
  SOP_CONSTANTS
};
