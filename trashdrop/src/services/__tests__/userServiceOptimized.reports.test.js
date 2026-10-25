import userServiceOptimized from '../userServiceOptimized.js';
import supabase from '../../utils/supabaseClient.js';

jest.mock('../../utils/supabaseClient.js', () => ({ __esModule: true, default: { from: jest.fn() } }));
jest.mock('../../utils/requestDeduplication.js', () => ({
  deduplicatedRequests: { getUserStats: (userId, fn) => fn() },
}));

// A query builder that resolves to what the table returns
const table = (result) => {
  const builder = new Proxy({}, {
    get: (_, prop) => (prop === 'then' ? (resolve) => resolve(result) : () => builder),
  });
  return builder;
};

// An account with reports but no profiles row (so no dashboard view row) and no user_stats row
const noProfile = (reportCount) => (name) => ({
  user_stats_dashboard: table({ data: null, error: null }),
  user_stats: table({ data: null, error: null }),
  illegal_dumping_mobile: table({ data: null, error: null, count: reportCount }),
}[name]);

beforeEach(() => jest.clearAllMocks());

describe('report count for an account without a profile or user_stats row', () => {
  it('counts the reports on the dashboard stats', async () => {
    supabase.from.mockImplementation(noProfile(74));
    const { data } = await userServiceOptimized.getUserStatsOptimized('user-1');
    expect(data.reports).toBe(74);
  });

  it('counts the reports on the first (critical) stats', async () => {
    supabase.from.mockImplementation(noProfile(74));
    const stats = await userServiceOptimized.getCriticalStats('user-1');
    expect(stats.reports).toBe(74);
  });

  it('still shows zeros for a new account with nothing yet', async () => {
    supabase.from.mockImplementation(noProfile(0));
    const { data } = await userServiceOptimized.getUserStatsOptimized('user-1');
    expect(data.reports).toBe(0);
  });
});
