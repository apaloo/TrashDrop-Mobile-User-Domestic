// Netlify Function: check-batch
// Policy-safe server-side verification using Supabase service role key
// Endpoint: /.netlify/functions/check-batch?id=<uuid>|batch_number=<text>

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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
      console.log('[check-batch] Loaded env from', path.basename(file));
      break;
    }
  } catch (_) {
    // silent
  }
}

function getClient() {
  // Load local env for dev if not provided by Netlify CLI
  loadEnvFallback();

  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    return { error: new Error('Missing Supabase URL or service role key on server') };
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { supabase };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    const params = event.queryStringParameters || {};
    const id = params.id || null;
    const batchNumber = params.batch_number || null;

    const { supabase, error } = getClient();
    if (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    let data = null;
    let meta = { by: null };

    if (id) {
      const { data: row, error: err } = await supabase
        .from('batches')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
      }
      if (row) { data = row; meta.by = 'id'; }
    }

    if (!data && batchNumber) {
      // Try exact then ilike then contains
      let res = await supabase.from('batches').select('*').eq('batch_number', batchNumber).maybeSingle();
      if (res.error) {
        return { statusCode: 500, body: JSON.stringify({ error: res.error.message }) };
      }
      if (!res.data) {
        res = await supabase.from('batches').select('*').ilike('batch_number', batchNumber).maybeSingle();
      }
      if (!res.data) {
        res = await supabase.from('batches').select('*').ilike('batch_number', `%${batchNumber}%`).maybeSingle();
      }
      if (res.error) {
        return { statusCode: 500, body: JSON.stringify({ error: res.error.message }) };
      }
      if (res.data) { data = res.data; meta.by = 'batch_number'; }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, meta }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || 'Server error' }) };
  }
};
