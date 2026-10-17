import supabase from '../../utils/supabaseClient.js';
import {
  getLocationPrice,
  getAllPricesForLocation,
  clearPricingCache,
  resetCircuitBreaker,
  PricingUnavailableError
} from '../gpsPricingService.js';
import { getCostBreakdownWithGPS } from '../../utils/costCalculator.js';

// The real client validates env on import; only rpc() is involved here
jest.mock('../../utils/supabaseClient.js', () => ({
  __esModule: true,
  default: { rpc: jest.fn() }
}));

const zone = (overrides = {}) => ({
  id: 'z1',
  region: 'Greater Accra',
  district: 'Accra Metro',
  community: 'Ayawaso Central',
  suburb: 'Dzorwulu',
  price_120l: '35.00',
  price_660l: null,
  ...overrides
});

// Distinct coordinates per test keep the 5-minute zone cache out of the way
let lat = 5.6;
const nextPin = () => [(lat += 0.01), -0.19];

const reasonOf = (promise) => promise.then(
  () => { throw new Error('expected PricingUnavailableError'); },
  (error) => {
    expect(error).toBeInstanceOf(PricingUnavailableError);
    return error.reason;
  }
);

describe('gpsPricingService prices only from the covering zone', () => {
  beforeEach(() => {
    supabase.rpc.mockReset();
    clearPricingCache();
    resetCircuitBreaker();
  });

  it('prices a covered pin from its zone', async () => {
    supabase.rpc.mockResolvedValue({ data: [zone()], error: null });
    const [la, lo] = nextPin();

    const result = await getLocationPrice(la, lo, 120);

    expect(supabase.rpc).toHaveBeenCalledWith('get_covering_pricing_zone', { p_latitude: la, p_longitude: lo });
    expect(result).toMatchObject({ price: 35, source: 'gps', zone: { suburb: 'Dzorwulu' } });
  });

  it('refuses a pin outside every zone instead of using a default price', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null });

    expect(await reasonOf(getLocationPrice(...nextPin(), 120))).toBe('not_covered');
    expect(await reasonOf(getAllPricesForLocation(...nextPin()))).toBe('not_covered');
  });

  it('refuses a size the covering zone does not price', async () => {
    supabase.rpc.mockResolvedValue({ data: [zone()], error: null });

    expect(await reasonOf(getLocationPrice(...nextPin(), 660))).toBe('size_unpriced');
  });

  it('leaves unpriced sizes out of the price list rather than filling them in', async () => {
    supabase.rpc.mockResolvedValue({ data: [zone()], error: null });

    const { prices } = await getAllPricesForLocation(...nextPin());

    expect(prices).toEqual({ 120: 35 });
  });

  it('reports a failed lookup as lookup_failed, and does not cache it', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'statement timeout' } });
    const pin = nextPin();

    expect(await reasonOf(getLocationPrice(...pin, 120))).toBe('lookup_failed');

    // "Try again" really retries
    supabase.rpc.mockResolvedValue({ data: [zone()], error: null });
    expect((await getLocationPrice(...pin, 120)).price).toBe(35);
  }, 15000);

  it('refuses to price without coordinates', async () => {
    expect(await reasonOf(getLocationPrice(null, null, 120))).toBe('no_location');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('lets the cost breakdown fail instead of falling back to BASE_COSTS', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null });

    expect(await reasonOf(getCostBreakdownWithGPS({ bin_size_liters: 120, latitude: 5.9, longitude: -1.2 })))
      .toBe('not_covered');
  });

  it('builds the breakdown from the zone price when covered', async () => {
    supabase.rpc.mockResolvedValue({ data: [zone()], error: null });

    const breakdown = await getCostBreakdownWithGPS({
      bin_size_liters: 120, latitude: 5.91, longitude: -1.2, bag_count: 2, is_urgent: true
    });

    // 2 × 35 = 70 base, +30% urgent = 21, +1 request fee
    expect(breakdown).toMatchObject({ base: 70, urgent_charge: 21, total: 92, pricing_source: 'gps' });
  });
});
