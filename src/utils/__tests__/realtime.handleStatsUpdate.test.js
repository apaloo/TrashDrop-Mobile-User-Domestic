import { handleStatsUpdate } from '../realtime.js';

describe('handleStatsUpdate', () => {
  it('maps user_stats total_bags to totalBags and updates batches', () => {
    const current = { points: 0, pickups: 0, reports: 0, batches: 0, totalBags: 0, total_bags: 0 };
    const payload = {
      eventType: 'UPDATE',
      new: { user_id: 'user123', total_bags: 7, total_batches: 3, points: 10 }
    };

    const updated = handleStatsUpdate('user_stats', payload, current);

    expect(updated.total_bags).toBe(7);
    expect(updated.totalBags).toBe(7);
    expect(updated.batches).toBe(3);
    expect(updated.points).toBe(10);
  });

  it('returns current stats when payload missing', () => {
    const current = { totalBags: 2 };
    const updated = handleStatsUpdate('user_stats', null, current);
    expect(updated).toEqual(current);
  });

  it('maps snake_case totals for points, pickups, and reports to camelCase', () => {
    const current = { points: 0, pickups: 0, reports: 0 };
    const payload = {
      eventType: 'UPDATE',
      new: { total_points: 99, total_pickups: 12, total_reports: 5 }
    };

    const updated = handleStatsUpdate('user_stats', payload, current);

    expect(updated.points).toBe(99);
    expect(updated.pickups).toBe(12);
    expect(updated.reports).toBe(5);
  });

  it('mirrors total_batches on state when provided', () => {
    const current = { batches: 0 };
    const payload = {
      eventType: 'UPDATE',
      new: { total_batches: 4 }
    };

    const updated = handleStatsUpdate('user_stats', payload, current);
    expect(updated.batches).toBe(4);
    expect(updated.total_batches).toBe(4);
  });

  it('prefers available_bags for bag totals and mirrors to totalBags/total_bags', () => {
    const current = { totalBags: 1, total_bags: 1 };
    const payload = {
      eventType: 'UPDATE',
      new: { available_bags: 9, total_bags: 3, total_bags_scanned: 5 }
    };

    const updated = handleStatsUpdate('user_stats', payload, current);
    expect(updated.totalBags).toBe(9);
    expect(updated.total_bags).toBe(9);
    expect(updated.available_bags).toBe(9);
  });
});
