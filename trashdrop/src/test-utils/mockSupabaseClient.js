/**
 * Stand-in for utils/supabaseClient.js in page tests:
 *
 *   jest.mock('../../utils/supabaseClient.js', () => require('../../test-utils/mockSupabaseClient.js'));
 *
 * Every query chain (select, eq, in, order, limit, …) returns itself and
 * resolves to an empty result, so pages can build whatever query they need.
 * single()/maybeSingle() resolve to no row, rpc() to no data, channels and
 * auth to signed-out no-ops. Uses plain functions, not jest.fn(), because
 * react-scripts resets mock implementations before every test.
 */
const EMPTY = { data: [], error: null };
const NO_ROW = { data: null, error: null };

const query = () => {
  const builder = new Proxy({}, {
    get: (_, prop) => {
      if (prop === 'then') return (resolve, reject) => Promise.resolve(EMPTY).then(resolve, reject);
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(NO_ROW);
      return () => builder;
    },
  });
  return builder;
};

const channel = () => {
  const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} };
  return ch;
};

const subscription = { unsubscribe: () => {} };
const client = {
  from: query,
  rpc: () => Promise.resolve(NO_ROW),
  channel,
  removeChannel: () => {},
  removeAllChannels: () => {},
  getChannels: () => [],
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    refreshSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription } }),
  },
  storage: { from: () => ({ upload: () => Promise.resolve(NO_ROW), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
};

module.exports = { __esModule: true, default: client, ...client };
