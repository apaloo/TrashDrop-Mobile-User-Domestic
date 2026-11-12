import { userService } from '../userService.js';
import supabase from '../../utils/supabaseClient.js';

jest.mock('../../utils/supabaseClient.js', () => ({ __esModule: true, default: { from: jest.fn() } }));

// A query builder that records its select and resolves to what the table returns
const selects = {};
let inFlight = 0;
let maxInFlight = 0;
const table = (name, result) => {
  const builder = new Proxy({}, {
    get: (_, prop) => {
      if (prop === 'then') {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return (resolve) => setTimeout(() => { inFlight -= 1; resolve(result); }, 5);
      }
      if (prop === 'select') return (cols) => { selects[name] = cols; return builder; };
      return () => builder;
    },
  });
  return builder;
};

const TABLES = {
  profiles: { data: { id: 'u1', level: 'Eco Hero', email: 'a@b.c', first_name: 'Ama', last_name: 'K' }, error: null },
  user_stats: { data: { available_bags: 4 }, error: null },
  pickup_requests: {
    data: [{ points_earned: 10, status: 'completed' }, { points_earned: 5, status: 'pending' }, { points_earned: 5, status: 'cancelled' }],
    error: null,
  },
  digital_bins: { data: [{ id: 1, status: 'disposed' }, { id: 2, status: 'cancelled' }], error: null },
  illegal_dumping_mobile: {
    data: [
      { severity: 'high', status: 'verified', created_at: '2026-11-01T00:00:00Z' }, // 20
      { severity: 'low', status: 'submitted', created_at: '2026-11-01T00:00:00Z' }, // 0, not verified yet
      { severity: 'medium', status: 'submitted', created_at: '2026-10-01T00:00:00Z' }, // 15, before the rule
    ],
    count: 3,
    error: null,
  },
  bag_inventory: { data: [], count: 0, error: null },
  batches: { data: [{ bag_count: 10 }, { bag_count: 5 }], error: null },
  rewards_redemption: { data: [{ points_spent: 20, status: 'approved' }, { points_spent: 50, status: 'rejected' }], error: null },
  // The balance the server checks when a reward is redeemed
  user_stats_dashboard: { data: { total_points: 123, total_pickups: 7 }, error: null },
};
const withTable = (name, result) => (n) => table(n, n === name ? result : TABLES[n]);

beforeEach(() => {
  inFlight = 0;
  maxInFlight = 0;
  Object.keys(selects).forEach((k) => delete selects[k]);
  supabase.from.mockImplementation((name) => table(name, TABLES[name]));
});

describe('userService.getUserStats', () => {
  it("shows the server's balance, the one a redemption is checked against", async () => {
    const { data, error } = await userService.getUserStats('u1');
    expect(error).toBeNull();
    expect(data.points).toBe(123);
    expect(data.pickups).toBe(7);
    expect(data.reports).toBe(3);
    expect(data.batches).toBe(2);
    expect(data.totalBags).toBe(15);
    expect(data.available_bags).toBe(4);
    expect(data.level).toBe('Eco Hero');
  });

  it("works it out with the server's rules when the balance can't be read", async () => {
    supabase.from.mockImplementation(withTable('user_stats_dashboard', { data: null, error: { message: 'boom' } }));
    const { data } = await userService.getUserStats('u1');
    // pickups 15 + bins 15 + reports 35 - spent 20 (rejected one refunded);
    // the cancelled pickup and the cancelled bin earn nothing
    expect(data.points).toBe(45);
    expect(data.pickups).toBe(3);
  });

  it('counts profile points in that case too', async () => {
    supabase.from.mockImplementation((n) => (n === 'user_stats_dashboard'
      ? table(n, { data: null, error: null })
      : n === 'profiles' ? table(n, { data: { ...TABLES.profiles.data, points: 100 }, error: null }) : table(n, TABLES[n])));
    const { data } = await userService.getUserStats('u1');
    expect(data.points).toBe(145);
  });

  it('never downloads the profile photo', async () => {
    await userService.getUserStats('u1');
    expect(selects.profiles).not.toMatch(/avatar/);
  });

  it('runs the lookups at the same time, not one after another', async () => {
    await userService.getUserStats('u1');
    expect(maxInFlight).toBe(9);
  });

  it('still works when one lookup fails', async () => {
    supabase.from.mockImplementation(withTable('batches', { data: null, error: { message: 'boom' } }));
    const { data } = await userService.getUserStats('u1');
    expect(data.points).toBe(123);
    expect(data.batches).toBe(0);
  });
});
