/**
 * Checks for the check-batch function (TD7: caller authentication).
 *
 *   node netlify/functions/__checks__/check-batch.js
 *
 * Runs the real handler against a stubbed Supabase client. No network, no
 * database, no credentials.
 */
const path = require('path');
const assert = require('assert');

const FN = path.join(__dirname, '..');

// ---- stub Supabase ---------------------------------------------------------
const OWNER = '11111111-1111-4111-8111-111111111111';
const CALLER = '22222222-2222-4222-8222-222222222222';
const BATCH_ID = '33333333-3333-4333-8333-333333333333';
const rows = [
  { id: BATCH_ID, batch_number: '1731234567890-ab12cd', status: 'active', bag_count: 5,
    created_by: OWNER, user_id: null, assigned_to: CALLER, secret_note: 'internal', created_at: '2026-11-01T00:00:00Z' },
];
const TOKENS = { 'good-token': CALLER };
const calls = [];

// Very small query builder: eq / ilike (exact, with LIKE escapes) / limit
const from = (table) => {
  const filters = [];
  const builder = {
    select: () => builder,
    eq: (col, val) => { filters.push((r) => r[col] === val); calls.push(['eq', col, val]); return builder; },
    ilike: (col, pattern) => {
      calls.push(['ilike', col, pattern]);
      if (/(^|[^\\])[%_]/.test(pattern)) throw new Error(`unescaped wildcard in ${pattern}`);
      const literal = pattern.replace(/\\(.)/g, '$1').toLowerCase();
      filters.push((r) => String(r[col] || '').toLowerCase() === literal);
      return builder;
    },
    limit: (n) => Promise.resolve({ data: (table === 'batches' ? rows : []).filter((r) => filters.every((f) => f(r))).slice(0, n), error: null }),
  };
  return builder;
};
const client = {
  from,
  auth: {
    getUser: async (token) => (TOKENS[token]
      ? { data: { user: { id: TOKENS[token] } }, error: null }
      : { data: { user: null }, error: { message: 'invalid JWT' } }),
  },
};
const adminPath = path.join(FN, 'utils', 'supabase-admin.js');
require.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true, exports: { getServiceClient: () => client } };

const { handler, _internals } = require(path.join(FN, 'check-batch.js'));

const get = (query, headers = { authorization: 'Bearer good-token' }) =>
  handler({ httpMethod: 'GET', queryStringParameters: query, headers })
    .then((res) => ({ ...res, json: res.body ? JSON.parse(res.body) : null }));

// ---- checks ----------------------------------------------------------------
const checks = [
  ['refuses callers without a token', async () => {
    const res = await get({ id: BATCH_ID }, {});
    assert.strictEqual(res.statusCode, 401);
    assert.ok(!calls.some((c) => c[0] === 'eq'), 'no lookup before the caller is known');
  }],
  ['refuses an invalid token', async () => {
    const res = await get({ id: BATCH_ID }, { authorization: 'Bearer forged' });
    assert.strictEqual(res.statusCode, 401);
  }],
  ['finds a batch by id for a signed-in caller', async () => {
    const res = await get({ id: BATCH_ID });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.data.id, BATCH_ID);
    assert.strictEqual(res.json.data.bag_count, 5);
  }],
  ["never returns another user's id or unlisted columns", async () => {
    const { json } = await get({ id: BATCH_ID });
    assert.strictEqual(json.data.created_by, 'another-user');
    assert.strictEqual(json.data.assigned_to, CALLER, "the caller's own id is kept");
    assert.strictEqual(json.data.user_id, null, 'empty stays empty (unclaimed)');
    assert.strictEqual(json.data.secret_note, undefined);
    assert.ok(!JSON.stringify(json).includes(OWNER));
  }],
  ['finds an exact batch number, ignoring case and a BATCH- prefix', async () => {
    for (const code of ['1731234567890-ab12cd', '1731234567890-AB12CD', 'BATCH-1731234567890-ab12cd']) {
      const res = await get({ batch_number: code });
      assert.strictEqual(res.statusCode, 200, code);
      assert.strictEqual(res.json.data.id, BATCH_ID, code);
    }
  }],
  ['no partial matches: part of a batch number is not found', async () => {
    for (const code of ['1731234567890', 'ab12cd', '1731234567890-ab12c']) {
      const res = await get({ batch_number: code });
      assert.strictEqual(res.statusCode, 404, code);
    }
  }],
  ['LIKE wildcards are escaped, so _ cannot match any character', async () => {
    assert.strictEqual(_internals.likeExact('a_b%c\\d'), 'a\\_b\\%c\\\\d');
    const res = await get({ batch_number: '1731234567890_ab12cd' });
    assert.strictEqual(res.statusCode, 404);
  }],
  ['rejects malformed input before any lookup', async () => {
    calls.length = 0;
    for (const query of [{ id: 'not-a-uuid' }, { batch_number: '%' }, { batch_number: 'a b' }, { batch_number: 'x'.repeat(65) }, {}]) {
      const res = await get(query);
      assert.strictEqual(res.statusCode, 400, JSON.stringify(query));
    }
    assert.strictEqual(calls.length, 0);
  }],
  ['only GET (and the CORS preflight)', async () => {
    assert.strictEqual((await handler({ httpMethod: 'POST', headers: {} })).statusCode, 405);
    assert.strictEqual((await handler({ httpMethod: 'OPTIONS', headers: {} })).statusCode, 204);
  }],
];

(async () => {
  let failed = 0;
  for (const [name, fn] of checks) {
    try {
      calls.length = 0;
      await fn();
      console.log(`  ok   ${name}`);
    } catch (e) {
      failed += 1;
      console.log(`  FAIL ${name}\n       ${e.message}`);
    }
  }
  console.log(failed ? `${failed} failed` : `${checks.length} passed`);
  process.exit(failed ? 1 : 0);
})();
