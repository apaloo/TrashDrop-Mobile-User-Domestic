// The Dashboard's consolidated Realtime channel. Realtime refuses a whole
// channel when any of its filters names a column the table doesn't have, so
// one bad binding silently stops every live update on it. On 2026-11-11 the
// channel filtered `alerts` (the admin portal's table, no user_id column):
// 2,359 "invalid column for filter user_id" errors in a day, the channel
// reconnecting every 3 seconds, and no live dashboard updates.
import { RealtimeManager } from '../realtimeOptimized';
import supabase from '../supabaseClient.js';

jest.mock('../supabaseClient.js', () => ({ __esModule: true, default: { channel: jest.fn(), removeChannel: jest.fn() } }));
jest.mock('../realtime.js', () => ({ handleStatsUpdate: () => ({}), handleDumpingReportUpdate: () => {} }));

// Columns of the published tables (supabase_realtime), checked on production
// 2026-11-12. Add a table here only after checking it is published and has
// the column you filter on.
const FILTERABLE = {
  user_stats: ['user_id'],
  pickup_requests: ['user_id'],
  digital_bins: ['user_id'],
  illegal_dumping_mobile: ['reported_by'],
  notifications: ['user_id'],
};

function bindingsOf(manager) {
  const bindings = [];
  const channel = {
    on: (type, cfg) => { bindings.push({ type, ...cfg }); return channel; },
    subscribe: () => channel,
  };
  supabase.channel.mockReturnValue(channel);
  manager.setupOptimizedSubscription('u1', {}, {}, { current: true });
  return bindings;
}

beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));

it('filters only real columns of published tables', () => {
  const bindings = bindingsOf(new RealtimeManager());
  expect(bindings.length).toBeGreaterThan(0);
  for (const b of bindings) {
    expect(b.type).toBe('postgres_changes');
    expect(Object.keys(FILTERABLE)).toContain(b.table);
    const column = String(b.filter).split('=')[0];
    expect(FILTERABLE[b.table]).toContain(column);
  }
});

it('does not subscribe to the admin alerts table', () => {
  const tables = bindingsOf(new RealtimeManager()).map((b) => b.table);
  expect(tables).not.toContain('alerts');
});
