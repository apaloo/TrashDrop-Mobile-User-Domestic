// Netlify Function: check-batch
//
// Looks up one batch for the signed-in household that scanned it. The batch
// may not be visible to them yet under row-level security (an unclaimed batch
// belongs to whoever printed it), so this reads it with the service key.
//
//   GET /.netlify/functions/check-batch?id=<uuid> | ?batch_number=<text>
//   Authorization: Bearer <the user's Supabase access token>
//
// Rules (TD7 in engineering/registers/tech-debt.md):
// - Only signed-in users: the token is checked with Supabase Auth.
// - Exact matches only: a UUID, or a batch number compared case-insensitively
//   with and without the BATCH- prefix. No partial matches, so batch numbers
//   can't be guessed by searching.
// - Only the fields the app needs. An owner field that isn't the caller is
//   returned as 'another-user', never as someone else's ID.
// Claiming a batch is decided in the database (activate_batch_for_user); this
// function only finds it.

const { getServiceClient } = require('./utils/supabase-admin.js');

const TOTAL_TIMEOUT_MS = parseInt(process.env.CHECK_BATCH_TOTAL_TIMEOUT_MS || '9000', 10);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Batch numbers are short codes like BATCH-7F3K2: letters, digits, - and _
const BATCH_NUMBER = /^[A-Za-z0-9_-]{3,64}$/;
const OWNER_FIELDS = ['created_by', 'user_id', 'assigned_to', 'owner_id'];
const RETURNED_FIELDS = ['id', 'batch_number', 'status', 'bag_count', 'total_bags_count', 'created_at', 'updated_at'];
const OTHER_OWNER = 'another-user';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const reply = (statusCode, body) => ({
  statusCode,
  headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

// The caller's user id from their access token, or null
async function callerId(supabase, headers) {
  const auth = headers?.authorization || headers?.Authorization || '';
  const match = /^Bearer\s+(\S+)$/i.exec(auth);
  if (!match) return null;
  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

// BATCH-ABC and ABC are the same printed code
function batchNumberCandidates(value) {
  const bare = value.replace(/^batch-/i, '');
  return [...new Set([value, `BATCH-${bare}`, bare])];
}

// ilike with no wildcards is a case-insensitive exact match; _ is a wildcard
// in LIKE, so escape it (and the escape character)
const likeExact = (value) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

async function findBatch(supabase, { id, batchNumber }) {
  if (id) {
    const { data, error } = await supabase.from('batches').select('*').eq('id', id).limit(1);
    if (error) throw error;
    return data?.[0] || null;
  }
  for (const candidate of batchNumberCandidates(batchNumber)) {
    const { data, error } = await supabase
      .from('batches').select('*').ilike('batch_number', likeExact(candidate)).limit(2);
    if (error) throw error;
    if (data?.length === 1) return data[0];
    if (data?.length > 1) {
      // Two batches differing only in letter case: don't guess
      const exact = data.find((row) => row.batch_number === candidate);
      if (exact) return exact;
    }
  }
  return null;
}

// Only what the app needs; other people's ids never leave the server
function forCaller(batch, userId) {
  const out = {};
  for (const field of RETURNED_FIELDS) if (batch[field] !== undefined) out[field] = batch[field];
  for (const field of OWNER_FIELDS) {
    const value = batch[field];
    if (value === undefined) continue;
    out[field] = value === null || value === '' || String(value) === userId ? value : OTHER_OWNER;
  }
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { ...CORS_HEADERS }, body: '' };
  if (event.httpMethod !== 'GET') return reply(405, { error: 'Method Not Allowed' });

  const params = event.queryStringParameters || {};
  const id = params.id ? String(params.id).trim() : null;
  const batchNumber = params.batch_number ? String(params.batch_number).trim() : null;

  if (id && !UUID.test(id)) return reply(400, { error: 'id must be a batch UUID' });
  if (!id && !(batchNumber && BATCH_NUMBER.test(batchNumber))) {
    return reply(400, { error: 'Provide id (UUID) or batch_number (letters, digits, - or _)' });
  }

  let supabase;
  try {
    supabase = getServiceClient('[check-batch]');
  } catch (e) {
    console.error(e.message);
    return reply(500, { error: 'Batch lookup is not configured on the server' });
  }

  try {
    return await withTimeout((async () => {
      const userId = await callerId(supabase, event.headers);
      if (!userId) return reply(401, { error: 'Sign in to scan a batch' });

      const batch = await findBatch(supabase, { id, batchNumber });
      if (!batch) {
        return reply(404, { error: 'Batch not found in batches table for provided identifier', meta: { by: id ? 'id' : 'batch_number' } });
      }
      return reply(200, { data: forCaller(batch, userId), meta: { by: id ? 'id' : 'batch_number' } });
    })(), TOTAL_TIMEOUT_MS, 'Batch lookup');
  } catch (e) {
    if (String(e?.message || '').includes('timed out')) return reply(504, { error: 'Lookup timed out' });
    console.error('[check-batch] lookup failed:', e?.message || e);
    return reply(500, { error: 'Batch lookup failed' });
  }
};

// For the checks in __checks__/check-batch.js
exports._internals = { batchNumberCandidates, likeExact, forCaller };
