/**
 * Server-side pricing for WhatsApp bookings.
 *
 * This is a faithful mirror of the client-side pricing used by the in-app
 * "Request Bin Pickup (No Bag)" flow so that a booking made over WhatsApp is
 * quoted exactly like the same booking made in the app:
 *
 *   src/utils/costCalculator.js       → getCostBreakdownWithGPS
 *   src/services/gpsPricingService.js → get_covering_pricing_zone RPC
 *   src/services/promotionalService.js→ promotional_usage / promotional_fee_schedule
 *
 * Pricing order (SOP v4.5.6):
 *   Base → Urgent (30% of Base) → Request fee (GHS 1) → Total
 * Distance and surge are 0 at creation time; they are settled server-side when
 * a collector accepts, exactly as in the app.
 *
 * The base price comes only from the pricing zone covering the pin. There are
 * no default prices: a pin outside coverage, a size the zone does not price, or
 * a failed lookup throws PricingUnavailableError and the booking is not quoted.
 */

// Bin sizes accepted by the digital_bins CHECK constraint (costCalculator.BIN_SIZES)
const BIN_SIZES = [60, 80, 90, 100, 120, 240, 340, 360, 660, 1100];

const BIN_SIZE_LABELS = {
  60: 'Extra Small',
  80: 'Small',
  90: 'Small',
  100: 'Medium',
  120: 'Standard (Recommended)',
  240: 'Large',
  340: 'Extra Large',
  360: 'Extra Large',
  660: 'Industrial',
  1100: 'Commercial',
};

// SOP v4.5.6 constants (costCalculator.SOP_CONSTANTS)
const URGENT_SURCHARGE = 0.30;
const REQUEST_FEE = 1.0;

/**
 * Why a booking could not be priced — same reasons as gpsPricingService
 *   not_covered   — outside every zone's service radius
 *   size_unpriced — the covering zone has no price for this bin size
 *   lookup_failed — the pricing lookup itself failed; retrying may work
 */
class PricingUnavailableError extends Error {
  constructor(reason, message) {
    super(message || reason);
    this.name = 'PricingUnavailableError';
    this.reason = reason;
  }
}

const round2 = (n) => parseFloat(Number(n).toFixed(2));

function getBinSizeLabel(liters) {
  return `${liters}L - ${BIN_SIZE_LABELS[liters] || 'Standard'}`;
}

function getBinSizeLabelShort(liters) {
  return `${liters}L`;
}

function formatCurrency(amount) {
  return `GHS ${Number(amount).toFixed(2)}`;
}

/**
 * Base cost per bin for a location, from the zone covering it.
 * Mirrors gpsPricingService.getLocationPrice().
 *
 * @throws {PricingUnavailableError}
 */
async function getBaseCostPerBin(supabase, { bin_size_liters, latitude, longitude }) {
  if (latitude == null || longitude == null) {
    throw new PricingUnavailableError('not_covered', 'No location to price');
  }

  let data;
  try {
    const result = await supabase.rpc('get_covering_pricing_zone', {
      p_latitude: Number(latitude),
      p_longitude: Number(longitude),
    });
    if (result.error) throw new Error(result.error.message);
    data = result.data;
  } catch (err) {
    console.error('[Pricing] Covering zone lookup failed:', err.message);
    throw new PricingUnavailableError('lookup_failed', err.message);
  }

  const zone = Array.isArray(data) ? data[0] : data;
  if (!zone) {
    throw new PricingUnavailableError('not_covered', 'Location is outside every service area');
  }

  const zonePrice = Number(zone[`price_${bin_size_liters}l`]);
  if (!Number.isFinite(zonePrice) || zonePrice <= 0) {
    throw new PricingUnavailableError('size_unpriced', `${zone.suburb} has no ${bin_size_liters}L price`);
  }

  return { baseCost: zonePrice, pricingSource: 'gps', zone };
}

/**
 * Promotional eligibility for a linked app account.
 * WhatsApp users with no linked account are never promotional — the guest
 * owner has no promotional_usage row of its own to spend.
 */
async function getPromotionalState(supabase, userId) {
  const none = { isEligible: false, usedCount: 0, maxRequests: 0 };
  if (!userId) return none;

  try {
    const { data, error } = await supabase
      .from('promotional_usage')
      .select('is_eligible, used_count, max_requests')
      .eq('user_id', userId)
      .single();

    if (error || !data) return none;

    return {
      isEligible: data.is_eligible ?? false,
      usedCount: data.used_count ?? 0,
      maxRequests: data.max_requests ?? 5,
    };
  } catch (err) {
    console.warn('[Pricing] Promotional eligibility check failed:', err.message);
    return none;
  }
}

async function getPromotionalFee(supabase, binSizeLiters) {
  const none = { clientFee: null, collectorPayout: null, platformSubsidy: null };

  try {
    const { data, error } = await supabase
      .from('promotional_fee_schedule')
      .select('client_fee, collector_payout, platform_subsidy')
      .eq('bin_size_liters', binSizeLiters)
      .eq('is_active', true)
      .single();

    if (error || !data) return none;

    return {
      clientFee: parseFloat(data.client_fee),
      collectorPayout: parseFloat(data.collector_payout),
      platformSubsidy: data.platform_subsidy != null ? parseFloat(data.platform_subsidy) : null,
    };
  } catch (err) {
    console.warn('[Pricing] Promotional fee lookup failed:', err.message);
    return none;
  }
}

/**
 * Quote a booking. Same inputs and same arithmetic as
 * digitalBinService.prepareDigitalBinData(), so the fee the customer is shown
 * in chat is the fee that gets written to digital_bins.fee.
 *
 * @returns {Promise<Object>} quote used for both the review message and the RPC
 * @throws {PricingUnavailableError} when the pin or bin size cannot be priced
 */
async function quoteBooking(supabase, {
  bin_size_liters,
  bag_count = 1,
  is_urgent = false,
  latitude = null,
  longitude = null,
  user_id = null,
}) {
  const size = BIN_SIZES.includes(bin_size_liters) ? bin_size_liters : 120;
  const binCount = Math.max(1, parseInt(bag_count, 10) || 1);

  const { baseCost, pricingSource, zone } = await getBaseCostPerBin(supabase, {
    bin_size_liters: size,
    latitude,
    longitude,
  });

  const base = baseCost * binCount;
  const urgentCharge = is_urgent ? base * URGENT_SURCHARGE : 0;
  const standardTotal = base + urgentCharge + REQUEST_FEE;

  // --- Promotional path: flat client fee, bypasses the SOP pipeline ---
  const promoState = await getPromotionalState(supabase, user_id);
  if (promoState.isEligible) {
    const promoFee = await getPromotionalFee(supabase, size);
    if (promoFee.clientFee != null) {
      const collectorPayout = promoFee.collectorPayout ?? promoFee.clientFee;
      return {
        bin_size_liters: size,
        bin_count: binCount,
        base_per_bin: round2(baseCost),
        base: round2(base),
        urgent_charge: 0,
        request_fee: 0,
        total: round2(promoFee.clientFee),
        standard_total: round2(standardTotal),
        pricing_source: pricingSource,
        pricing_zone: zone,
        is_promotional: true,
        promo_request_number: promoState.usedCount + 1,
        promo_max_requests: promoState.maxRequests,
        collector_core_payout: round2(collectorPayout),
        collector_urgent_payout: 0,
        collector_total_payout: round2(collectorPayout),
      };
    }
  }

  // --- Standard SOP v4.5.6 path ---
  return {
    bin_size_liters: size,
    bin_count: binCount,
    base_per_bin: round2(baseCost),
    base: round2(base),
    urgent_charge: round2(urgentCharge),
    request_fee: REQUEST_FEE,
    total: round2(standardTotal),
    standard_total: round2(standardTotal),
    pricing_source: pricingSource,
    pricing_zone: zone,
    is_promotional: false,
    promo_request_number: null,
    promo_max_requests: promoState.maxRequests,
    // Core has no on-site charges or discounts on a WhatsApp booking
    collector_core_payout: round2(base),
    collector_urgent_payout: round2(urgentCharge),
    collector_total_payout: round2(base + urgentCharge),
  };
}

module.exports = {
  BIN_SIZES,
  PricingUnavailableError,
  BIN_SIZE_LABELS,
  URGENT_SURCHARGE,
  REQUEST_FEE,
  getBinSizeLabel,
  getBinSizeLabelShort,
  formatCurrency,
  getBaseCostPerBin,
  getPromotionalState,
  getPromotionalFee,
  quoteBooking,
};
