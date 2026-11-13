import supabase from '../../utils/supabaseClient.js';
import {
  findCoveringPricingZone, clearPricingCache, resetCircuitBreaker, PricingUnavailableError,
} from '../gpsPricingService.js';

// Protected pricing code (CLAUDE.md): tests only add cases. How the zone
// lookup behind every digital-bin price copes with a slow or failing
// database: retries, a timeout, a circuit breaker that stops hammering it,
// and a 5-minute cache. gpsPricingService.test.js covers the prices themselves.
jest.mock('../../utils/supabaseClient.js', () => ({ __esModule: true, default: { rpc: jest.fn() } }));

const ZONE = { id: 'z1', suburb: 'Dzorwulu', price_120l: '35.00' };
let lat = 6.0;
const pin = () => [(lat += 0.01), -0.19];
const reasonOf = (p) => p.then(() => { throw new Error('expected PricingUnavailableError'); }, (e) => {
  expect(e).toBeInstanceOf(PricingUnavailableError);
  return e.reason;
});
// Run a lookup to the end, letting retry delays and timeouts pass
// (Jest 27: no advanceTimersByTimeAsync, so step the clock and let promises run)
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const settle = async (promise, ms = 20000) => {
  const outcome = promise.then((v) => ({ v }), (e) => ({ e }));
  for (let t = 0; t < ms; t += 250) { await flush(); jest.advanceTimersByTime(250); }
  await flush();
  const r = await outcome;
  if (r.e) throw r.e;
  return r.v;
};
const failing = () => supabase.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

beforeEach(() => {
  jest.useFakeTimers('modern');
  supabase.rpc.mockReset();
  clearPricingCache();
  resetCircuitBreaker();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('findCoveringPricingZone: a failing or slow database', () => {
  it('no position is refused at once, without asking the database', async () => {
    for (const [a, b] of [[null, -0.19], [5.6, undefined], [NaN, 1]]) {
      expect(await reasonOf(findCoveringPricingZone(a, b))).toBe('no_location');
    }
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('a passing failure is retried (twice, after 0.5 s then 1 s) and the zone is used', async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'connection reset' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'connection reset' } })
      .mockResolvedValueOnce({ data: [ZONE], error: null });
    const [a, b] = pin();
    await expect(settle(findCoveringPricingZone(a, b))).resolves.toEqual(ZONE);
    expect(supabase.rpc).toHaveBeenCalledTimes(3);
    expect(supabase.rpc).toHaveBeenCalledWith('get_covering_pricing_zone', { p_latitude: a, p_longitude: b });
  });

  it('three failed attempts are "lookup failed", never a made-up price', async () => {
    failing();
    expect(await reasonOf(settle(findCoveringPricingZone(...pin())))).toBe('lookup_failed');
    expect(supabase.rpc).toHaveBeenCalledTimes(3);
  });

  it('a lookup that never answers times out (5 s each attempt) and fails', async () => {
    supabase.rpc.mockReturnValue(new Promise(() => {}));
    expect(await reasonOf(settle(findCoveringPricingZone(...pin()), 30000))).toBe('lookup_failed');
    expect(supabase.rpc).toHaveBeenCalledTimes(3);
  });

  it('after three failed lookups the circuit opens: no more database calls for 60 s', async () => {
    failing();
    for (let i = 0; i < 3; i++) await reasonOf(settle(findCoveringPricingZone(...pin())));
    supabase.rpc.mockClear();
    expect(await reasonOf(findCoveringPricingZone(...pin()))).toBe('lookup_failed');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('after 60 s one lookup is let through, and a success closes the circuit', async () => {
    failing();
    for (let i = 0; i < 3; i++) await reasonOf(settle(findCoveringPricingZone(...pin())));
    jest.advanceTimersByTime(60000);
    supabase.rpc.mockReset().mockResolvedValue({ data: [ZONE], error: null });
    await expect(settle(findCoveringPricingZone(...pin()))).resolves.toEqual(ZONE);
    await expect(settle(findCoveringPricingZone(...pin()))).resolves.toEqual(ZONE);
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });

  it('a failure is not cached: "Try again" really asks again', async () => {
    const [a, b] = pin();
    failing();
    await reasonOf(settle(findCoveringPricingZone(a, b)));
    supabase.rpc.mockReset().mockResolvedValue({ data: [ZONE], error: null });
    await expect(settle(findCoveringPricingZone(a, b))).resolves.toEqual(ZONE);
  });
});

describe('findCoveringPricingZone: the 5-minute cache', () => {
  it('the same spot (to 4 decimals) within 5 minutes is answered from the cache', async () => {
    supabase.rpc.mockResolvedValue({ data: [ZONE], error: null });
    const [a, b] = pin();
    await settle(findCoveringPricingZone(a, b));
    await expect(findCoveringPricingZone(a + 0.00001, b)).resolves.toEqual(ZONE);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5 * 60 * 1000);
    await settle(findCoveringPricingZone(a, b));
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });

  it('a spot outside every zone is remembered as outside (null), not retried each time', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null });
    const [a, b] = pin();
    await expect(settle(findCoveringPricingZone(a, b))).resolves.toBeNull();
    await expect(findCoveringPricingZone(a, b)).resolves.toBeNull();
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('a single zone object (not a list) is accepted too', async () => {
    supabase.rpc.mockResolvedValue({ data: ZONE, error: null });
    await expect(settle(findCoveringPricingZone(...pin()))).resolves.toEqual(ZONE);
  });
});
