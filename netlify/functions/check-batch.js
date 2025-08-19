// Netlify Function: check-batch
// Policy-safe server-side verification using Supabase service role key
// Endpoint: /.netlify/functions/check-batch?id=<uuid>|batch_number=<text>

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Time budgets to avoid Netlify 504s (configurable via env)
const QUERY_TIMEOUT_MS = parseInt(process.env.CHECK_BATCH_QUERY_TIMEOUT_MS || '5000', 10);     // per-query budget
const TOTAL_TIMEOUT_MS = parseInt(process.env.CHECK_BATCH_TOTAL_TIMEOUT_MS || '9000', 10);     // overall handler budget

// Lightweight debug logging controlled by env
const DEBUG = /^(1|true|yes)$/i.test(process.env.CHECK_BATCH_DEBUG || '');
const dlog = (...args) => { if (DEBUG) console.log('[check-batch]', ...args); };

function withTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))
  ]);
}

function loadEnvFallback() {
  try {
    const cwd = process.cwd();
    const candidates = [
      path.join(cwd, '.env.development.local'),
      path.join(cwd, '.env.local'),
      path.join(cwd, '.env.development'),
      path.join(cwd, '.env'),
    ];
    for (const file of candidates) {
      if (!fs.existsSync(file)) continue;
      const txt = fs.readFileSync(file, 'utf8');
      txt.split('\n').forEach((line) => {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m) return;
        const key = m[1];
        let val = m[2];
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val;
      });
      dlog('Loaded env from', path.basename(file));
      break;
    }
  } catch (_) {
    // silent
  }
}

function getClient() {
  // Load local env for dev if not provided by Netlify CLI
  if (process.env.NODE_ENV !== 'production') {
    loadEnvFallback();
  }

  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { error: new Error('Missing Supabase URL or service role key on server') };
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { supabase };
}

// Basic CORS headers for browser access
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

exports.handler = async (event) => {
  try {
    const started = Date.now();
    const remaining = () => Math.max(250, TOTAL_TIMEOUT_MS - (Date.now() - started));
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: { ...CORS_HEADERS }, body: '' };
    }
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, headers: { ...CORS_HEADERS }, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    const params = event.queryStringParameters || {};
    const id = params.id || null;
    const batchNumber = params.batch_number || null;

    dlog('Start', { id, batchNumber, QUERY_TIMEOUT_MS, TOTAL_TIMEOUT_MS });

    const { supabase, error } = getClient();
    if (error) {
      return { statusCode: 500, headers: { ...CORS_HEADERS }, body: JSON.stringify({ error: error.message }) };
    }

    let data = null;
    let meta = { by: null };

    if (id) {
      dlog('Query by id');
      const { data: row, error: err } = await withTimeout(
        supabase
          .from('batches')
          .select('*')
          .eq('id', id)
          .maybeSingle(),
        Math.min(QUERY_TIMEOUT_MS, remaining()),
        'id lookup'
      );
      if (err) {
        dlog('Error id lookup', err?.message || String(err));
        return { statusCode: 500, headers: { ...CORS_HEADERS }, body: JSON.stringify({ error: err.message }) };
      }
      if (row) { data = row; meta.by = 'id'; dlog('Found by id'); }
    }

    if (!data && batchNumber) {
      // Timeboxed exact match
      dlog('Exact match by batch_number');
      const exact = await withTimeout(
        supabase.from('batches').select('*').eq('batch_number', batchNumber).maybeSingle(),
        Math.min(QUERY_TIMEOUT_MS, remaining()),
        'exact batch_number lookup'
      ).catch((e) => ({ error: e }));
      if (exact && exact.data) {
        data = exact.data; meta.by = 'batch_number'; dlog('Found exact batch_number');
      } else if (exact && exact.error) {
        dlog('Error exact batch_number lookup', exact.error?.message || String(exact.error));
        return { statusCode: 500, headers: { ...CORS_HEADERS }, body: JSON.stringify({ error: exact.error.message || String(exact.error) }) };
      }

      // If still not found and time permits, try contains search (case-insensitive)
      if (!data && remaining() > 400) {
        dlog('Contains match by batch_number');
        const contains = await withTimeout(
          supabase.from('batches').select('*').ilike('batch_number', `%${batchNumber}%`).maybeSingle(),
          Math.min(QUERY_TIMEOUT_MS, remaining()),
          'contains batch_number lookup'
        ).catch((e) => ({ error: e }));
        if (contains && contains.data) {
          data = contains.data; meta.by = 'batch_number'; dlog('Found contains batch_number');
        } else if (contains && contains.error && String(contains.error?.message || contains.error).includes('timed out')) {
          // If search timed out, return 504 to client so it can fallback gracefully
          dlog('Contains search timed out');
          return { statusCode: 504, headers: { ...CORS_HEADERS }, body: JSON.stringify({ error: 'Lookup timed out', meta: { by: 'batch_number' } }) };
        } else if (contains && contains.error) {
          dlog('Error contains batch_number lookup', contains.error?.message || String(contains.error));
          return { statusCode: 500, headers: { ...CORS_HEADERS }, body: JSON.stringify({ error: contains.error.message || String(contains.error) }) };
        }
      }
    }

    // Not found
    if (!data) {
      dlog('Not found');
      return {
        statusCode: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Batch not found', meta }),
      };
    }

    dlog('Success', { ms: Date.now() - started, by: meta.by });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ data, meta, timing: { ms: Date.now() - started } }),
    };
  } catch (e) {
    dlog('Handler error', e?.message || String(e));
    // If the handler itself timed out by our budget, signal 504 to help clients fallback gracefully
    if ((e?.message || '').includes('timed out')) {
      return { statusCode: 504, headers: { ...CORS_HEADERS }, body: JSON.stringify({ error: 'Server operation timed out' }) };
    }
    return { statusCode: 500, headers: { ...CORS_HEADERS }, body: JSON.stringify({ error: e.message || 'Server error' }) };
  }
};
