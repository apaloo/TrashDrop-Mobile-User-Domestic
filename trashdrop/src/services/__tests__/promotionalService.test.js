// Promotional pricing lookups (protected, docs/DIGITAL_BIN_PRICING.md). The
// database decides eligibility and prices each booking; these pin how the app
// reads them and that every failure means "no promotion", never a free or
// guessed price.
import {
  checkPromotionalEligibility, getPromotionalFee, getAllPromotionalFees, incrementPromotionalUsage,
} from '../promotionalService.js';

let mockCalls = [];
let mockResult = () => ({ data: null, error: null });
jest.mock('../../utils/supabaseClient.js', () => {
  const builder = (table) => {
    const q = {
      select: (cols) => { mockCalls.push(['select', table, cols]); return q; },
      eq: (col, val) => { mockCalls.push(['eq', col, val]); return q; },
      order: (col, opts) => { mockCalls.push(['order', col, opts]); return Promise.resolve(mockResult(table)); },
      single: () => Promise.resolve(mockResult(table)),
    };
    return q;
  };
  return {
    __esModule: true,
    default: {
      from: builder,
      rpc: (fn, args) => { mockCalls.push(['rpc', fn, args]); return Promise.resolve(mockResult(fn)); },
    },
  };
});

beforeEach(() => {
  mockCalls = [];
  mockResult = () => ({ data: null, error: null });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('checkPromotionalEligibility', () => {
  it("reads the user's own promotional_usage row", async () => {
    mockResult = () => ({ data: { is_eligible: true, used_count: 2, max_requests: 5 }, error: null });
    expect(await checkPromotionalEligibility('u1')).toEqual({ isEligible: true, usedCount: 2, maxRequests: 5 });
    expect(mockCalls).toContainEqual(['select', 'promotional_usage', 'is_eligible, used_count, max_requests']);
    expect(mockCalls).toContainEqual(['eq', 'user_id', 'u1']);
  });

  it('treats a missing row or a failed read as not eligible', async () => {
    mockResult = () => ({ data: null, error: { message: 'no rows' } });
    expect(await checkPromotionalEligibility('u1')).toEqual({ isEligible: false, usedCount: 0, maxRequests: 0 });
  });
});

describe('getPromotionalFee', () => {
  it('reads the active fee for the bin size as numbers', async () => {
    mockResult = () => ({ data: { client_fee: '22.00', collector_payout: '40.00', platform_subsidy: '18.00' }, error: null });
    expect(await getPromotionalFee(240)).toEqual({ clientFee: 22, collectorPayout: 40, platformSubsidy: 18 });
    expect(mockCalls).toContainEqual(['eq', 'bin_size_liters', 240]);
    expect(mockCalls).toContainEqual(['eq', 'is_active', true]);
  });

  it('returns no fee (never a guess) when the size has none', async () => {
    mockResult = () => ({ data: null, error: { message: 'no rows' } });
    expect(await getPromotionalFee(660)).toEqual({ clientFee: null, collectorPayout: null, platformSubsidy: null });
  });
});

describe('getAllPromotionalFees', () => {
  it('lists active fees smallest bin first', async () => {
    mockResult = () => ({ data: [{ bin_size_liters: 120, client_fee: '15', collector_payout: '25' }, { bin_size_liters: 240, client_fee: '22', collector_payout: '40' }], error: null });
    expect(await getAllPromotionalFees()).toEqual([
      { binSizeLiters: 120, clientFee: 15, collectorPayout: 25 },
      { binSizeLiters: 240, clientFee: 22, collectorPayout: 40 },
    ]);
    expect(mockCalls).toContainEqual(['order', 'bin_size_liters', { ascending: true }]);
  });

  it('returns an empty list when they cannot be read', async () => {
    mockResult = () => ({ data: null, error: { message: 'boom' } });
    expect(await getAllPromotionalFees()).toEqual([]);
  });
});

describe('incrementPromotionalUsage', () => {
  it('asks the database to use one promotion for the user', async () => {
    mockResult = () => ({ data: true, error: null });
    expect(await incrementPromotionalUsage('u1')).toBe(true);
    expect(mockCalls).toEqual([['rpc', 'increment_promotional_usage', { p_user_id: 'u1' }]]);
  });

  it.each([
    ['the database refuses', { data: null, error: { message: 'Only staff can do this' } }],
    ['no promotions are left', { data: false, error: null }],
  ])('reports false when %s', async (_l, result) => {
    mockResult = () => result;
    expect(await incrementPromotionalUsage('u1')).toBe(false);
  });
});
