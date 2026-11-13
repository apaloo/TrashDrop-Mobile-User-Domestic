// Protected pricing (docs/DIGITAL_BIN_PRICING.md): tests here only add cases.
//
// The price a household sees before booking a standard digital bin must be
// what the database charges when the bin is booked (td_price_digital_bin).
// Both read the zone from get_covering_pricing_zone; the formula is
// zone price × bags, +30% if urgent, + GH₵1. Every expected fee below was
// produced by the production function on 2026-11-13 for Airport Residential,
// Accra (5.6037, -0.1870), where the zone prices 120 L at GH₵55, 240 L at 80.
import { getCostBreakdownWithGPS } from '../costCalculator';

jest.mock('../../services/gpsPricingService.js', () => {
  const ZONE = { 120: 55, 240: 80 };
  class PricingUnavailableError extends Error {}
  return {
    __esModule: true,
    PricingUnavailableError,
    default: {
      getLocationPrice: async (_lat, _lng, size) => ({ price: ZONE[size], source: 'gps', zone: { suburb: 'Airport Resid.' } }),
    },
  };
});

const quote = (over) => getCostBreakdownWithGPS({
  latitude: 5.6037, longitude: -0.187, frequency: 'weekly', waste_type: 'general',
  distance_km: 0, on_site_charges: 0, discount_amount: 0, ...over,
});

// [label, booking, td_price_digital_bin(...).fee in production]
const CASES = [
  ['120 L, 1 bag', { bin_size_liters: 120, bag_count: 1, is_urgent: false }, 56.0],
  ['120 L, 3 bags', { bin_size_liters: 120, bag_count: 3, is_urgent: false }, 166.0],
  ['120 L, 1 bag, urgent', { bin_size_liters: 120, bag_count: 1, is_urgent: true }, 72.5],
  ['240 L, 2 bags, urgent', { bin_size_liters: 240, bag_count: 2, is_urgent: true }, 209.0],
];

describe('the quoted price is what the database charges', () => {
  test.each(CASES)('%s', async (_label, booking, dbFee) => {
    expect((await quote(booking)).total).toBe(dbFee);
  });

  test('frequency and waste type do not change the price (the database ignores them)', async () => {
    const base = (await quote({ bin_size_liters: 120, bag_count: 1, is_urgent: false })).total;
    for (const frequency of ['one-time', 'weekly', 'biweekly', 'monthly']) {
      for (const waste_type of ['general', 'recycling', 'organic']) {
        expect((await quote({ bin_size_liters: 120, bag_count: 1, is_urgent: false, frequency, waste_type })).total).toBe(base);
      }
    }
  });

  test('the booking flow passes no travel distance, so no distance charge is quoted (the database has none)', async () => {
    const b = await quote({ bin_size_liters: 120, bag_count: 1, is_urgent: true });
    expect(b.distance_charge).toBe(0);
    expect(b.total).toBe(72.5);
  });
});
