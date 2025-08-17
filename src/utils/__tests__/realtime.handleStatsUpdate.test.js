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
});
