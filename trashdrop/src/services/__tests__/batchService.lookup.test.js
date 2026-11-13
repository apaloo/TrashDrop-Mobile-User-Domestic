// Finding a batch from a scanned or typed code (TD36): exact matches only.
// A partial code must never pick another batch, and there is no built-in
// test batch. Unclaimed batches the user can't see are looked up by
// check-batch on the server (also exact only).
import { batchService, likeExact } from '../batchService';

jest.mock('../../utils/offlineStorage.js', () => ({
  __esModule: true,
  default: { cacheBatch: async () => {}, cacheBags: async () => {} },
  addToSyncQueue: async () => {},
  removeFromSyncQueue: async () => {},
  isOnline: () => true,
  getSyncQueueByOperation: async () => [],
}));

// Every query is recorded as [table, method, ...args]; mockRows decides
// what a finished query returns. Plain functions: CRA's resetMocks would
// wipe jest.fn implementations.
let mockCalls = [];
let mockRows = () => [];
jest.mock('../../utils/supabaseClient.js', () => {
  const from = (table) => {
    const own = [];
    const b = new Proxy({}, {
      get: (_, method) => {
        if (method === 'then') return (resolve) => resolve({ data: mockRows(table, own), error: null });
        return (...args) => { own.push([method, ...args]); mockCalls.push([table, method, ...args]); return b; };
      },
    });
    return b;
  };
  return {
    __esModule: true,
    default: {
      from,
      rpc: async () => ({ data: null, error: { message: 'rpc not expected in this test' } }),
      auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
    },
  };
});

const BATCH = { id: '33333333-3333-4333-8333-333333333333', batch_number: 'BATCH-7F3K2', status: 'active', bag_count: 5 };
// A table holding BATCH: eq is case-sensitive, ilike (escaped, no wildcards) ignores case
const tableWithBatch = (table, ops) => {
  if (table !== 'batches') return [];
  const eq = ops.find((o) => o[0] === 'eq');
  const ilike = ops.find((o) => o[0] === 'ilike');
  if (eq) return BATCH[eq[1]] === eq[2] ? [BATCH] : [];
  if (ilike) {
    const literal = ilike[2].replace(/\\(.)/g, '$1').toLowerCase();
    return String(BATCH[ilike[1]]).toLowerCase() === literal ? [BATCH] : [];
  }
  return [];
};
const patterns = () => mockCalls.filter((c) => c[1] === 'ilike').map((c) => c[3]);

let fetchCalls;
beforeEach(() => {
  mockCalls = [];
  mockRows = tableWithBatch;
  fetchCalls = [];
  global.fetch = async (url) => { fetchCalls.push(String(url)); return { ok: false, status: 404, json: async () => ({}) }; };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('likeExact', () => {
  it('escapes LIKE wildcards so ilike matches the whole code exactly', () => {
    expect(likeExact('BATCH-7F3K2')).toBe('BATCH-7F3K2');
    expect(likeExact('a_b%c\\d')).toBe('a\\_b\\%c\\\\d');
  });
});

describe('activateBatchForUser lookups', () => {
  const USER = '11111111-1111-4111-8111-111111111111';

  it('a partial code is not matched locally; it goes to check-batch, which also needs an exact code', async () => {
    const res = await batchService.activateBatchForUser('7F3', USER);
    expect(res.error?.message).toMatch(/Batch not found/);
    expect(patterns().some((p) => p.includes('%'))).toBe(false);
    expect(fetchCalls).toEqual([expect.stringMatching(/\/check-batch\?batch_number=7F3$/)]);
  });

  it('the former built-in test batch id is treated like any other id (no fake batch)', async () => {
    const res = await batchService.activateBatchForUser('e9dcf72b-6759-4b1d-8ad8-ea5f380ea9ed', USER);
    expect(res.data).toBeNull();
    expect(res.error?.message).toMatch(/Batch not found/);
    expect(fetchCalls).toEqual([expect.stringMatching(/\/check-batch\?id=e9dcf72b-6759-4b1d-8ad8-ea5f380ea9ed$/)]);
  });
});
