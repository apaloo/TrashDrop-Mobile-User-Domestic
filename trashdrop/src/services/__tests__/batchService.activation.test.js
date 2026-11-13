// Scanning a bag batch QR code (BatchQRScanner, onboarding): what happens
// after the batch is found. The database decides who may activate a batch
// (activate_batch_for_user checks the caller, 20261111222005); these tests
// pin what the app sends and how it reports each outcome.
import { batchService } from '../batchService';

jest.mock('../../utils/offlineStorage.js', () => ({
  __esModule: true,
  default: { cacheBatch: async () => {}, cacheBags: async () => {} },
  addToSyncQueue: async () => {},
  removeFromSyncQueue: async () => {},
  isOnline: () => true,
  getSyncQueueByOperation: async () => [],
}));

// Queries are recorded as [table, method, ...args]; rpc calls as ['rpc', fn, args].
// Plain functions: CRA's resetMocks would wipe jest.fn implementations.
let mockCalls = [];
let mockBatch = null;
let mockBags = [];
let mockRpc = () => ({ data: null, error: null });
jest.mock('../../utils/supabaseClient.js', () => {
  const from = (table) => {
    const own = [];
    const b = new Proxy({}, {
      get: (_, method) => {
        if (method === 'then') {
          return (resolve) => {
            if (table === 'batches' && own.some((o) => o[0] === 'update')) return resolve({ data: null, error: null });
            if (table === 'batches') return resolve({ data: mockBatch ? [mockBatch] : [], error: null });
            if (table === 'bags') return resolve({ data: mockBags, error: null });
            return resolve({ data: [], error: null });
          };
        }
        return (...args) => { own.push([method, ...args]); mockCalls.push([table, method, ...args]); return b; };
      },
    });
    return b;
  };
  return {
    __esModule: true,
    default: {
      from,
      rpc: async (fn, args) => { mockCalls.push(['rpc', fn, args]); return mockRpc(fn, args); },
      auth: { getSession: async () => ({ data: { session: { access_token: 'token', user: { id: 'u1' } } } }) },
    },
  };
});

const USER = '11111111-1111-4111-8111-111111111111';
const BATCH_ID = '33333333-3333-4333-8333-333333333333';
const rpcCalls = () => mockCalls.filter((c) => c[0] === 'rpc').map((c) => [c[1], c[2]]);
const once = { maxRetries: 1, timeoutMs: 2000 };

beforeEach(() => {
  mockCalls = [];
  mockBatch = { id: BATCH_ID, batch_number: 'BATCH-7F3K2', status: 'active', bag_count: 5, created_by: USER };
  mockBags = [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }];
  mockRpc = (fn) => (fn === 'activate_batch_for_user'
    ? { data: { success: true, bag_count: 5, activated_at: '2026-11-12T09:00:00Z' }, error: null }
    : { data: 1, error: null });
  global.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('verifyBatchAndUpdateUser', () => {
  it('activates the batch for the signed-in user and reports the bags added', async () => {
    const res = await batchService.verifyBatchAndUpdateUser('BATCH-7F3K2', USER, once);

    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ activated: true, bagsAdded: 5, batch_id: BATCH_ID });
    expect(rpcCalls()[0]).toEqual(['activate_batch_for_user', { p_batch_id: BATCH_ID, p_user_id: USER }]);
    expect(res.attempts).toBe(1);
  });

  it("leaves the user's stats to the database (no refresh of everyone's totals)", async () => {
    await batchService.verifyBatchAndUpdateUser('BATCH-7F3K2', USER, once);

    expect(rpcCalls().map(([fn]) => fn)).not.toContain('refresh_all_user_stats');
  });

  it('reads the code out of a scanned link', async () => {
    await batchService.verifyBatchAndUpdateUser(`https://trashdrops.com/scan?batch=${BATCH_ID}`, USER, once);
    expect(mockCalls).toContainEqual(['batches', 'eq', 'id', BATCH_ID]);
  });

  it('says a batch is already activated without activating it again', async () => {
    mockBatch.status = 'used';
    const res = await batchService.verifyBatchAndUpdateUser('BATCH-7F3K2', USER, once);
    expect(res.data).toMatchObject({ alreadyActivated: true, bagsAdded: 0, bag_count: 5 });
    expect(rpcCalls()).toHaveLength(0);
  });

  it('refuses a batch that is not active', async () => {
    mockBatch.status = 'pending';
    const res = await batchService.verifyBatchAndUpdateUser('BATCH-7F3K2', USER, once);
    expect(res.error).toMatchObject({ code: 'BATCH_INACTIVE' });
    expect(rpcCalls()).toHaveLength(0);
  });

  it("shows the database's refusal (for example another account's batch)", async () => {
    mockRpc = () => ({ data: { error: true, message: 'Sign in to activate a batch for your own account', code: 'NOT_ALLOWED' }, error: null });
    const res = await batchService.verifyBatchAndUpdateUser('BATCH-7F3K2', USER, once);
    expect(res.data).toBeNull();
    expect(res.error.message).toBe('Sign in to activate a batch for your own account');
  });

  it('reports an unknown code as not found after asking check-batch', async () => {
    mockBatch = null;
    const res = await batchService.verifyBatchAndUpdateUser('BATCH-NOPE', USER, once);
    expect(res.error.message).toMatch(/Batch not found/);
  });

  it('tries again after a failure, up to the limit', async () => {
    jest.spyOn(batchService, '_sleep').mockImplementation(async () => {});
    let n = 0;
    mockRpc = (fn) => {
      if (fn !== 'activate_batch_for_user') return { data: 1, error: null };
      n += 1;
      return n < 2 ? { data: null, error: { message: 'connection reset' } } : { data: { success: true, bag_count: 5 }, error: null };
    };
    const res = await batchService.verifyBatchAndUpdateUser('BATCH-7F3K2', USER, { maxRetries: 3, timeoutMs: 2000 });
    expect(res.error).toBeNull();
    expect(res.attempts).toBe(2);
  });
});
