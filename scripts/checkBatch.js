#!/usr/bin/env node
/*
  checkBatch.js
  Usage: node scripts/checkBatch.js <batch_uuid>
  Loads Supabase creds from environment or from trashdrop/.env, then queries public.batches by id.
*/

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnvFallback() {
  // If env vars already present, skip
  if (process.env.REACT_APP_SUPABASE_URL && process.env.REACT_APP_SUPABASE_ANON_KEY) return;
  const envPath = path.resolve(__dirname, '..', '.env');
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) return;
      const key = m[1];
      // Strip optional surrounding quotes
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    });
    console.log('[checkBatch] Loaded env from', envPath);
  } catch (e) {
    console.warn('[checkBatch] Could not load env file at', envPath, e.message);
  }
}

function extractUuid(input) {
  const uuidRegex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
  const match = String(input || '').match(uuidRegex);
  return match ? match[0] : null;
}

async function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error('Usage: node scripts/checkBatch.js <uuid-or-batch-number-or-url>');
    process.exit(2);
  }
  const id = extractUuid(raw);

  loadEnvFallback();

  const url = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.REACT_APP_SUPABASE_ANON_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY;
  if (!url || (!anon && !svc)) {
    console.error('[checkBatch] Missing Supabase credentials. Need REACT_APP_SUPABASE_URL/SUPABASE_URL and either REACT_APP_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE');
    process.exit(1);
  }

  console.log('[checkBatch] Target project:', url.replace(/^https?:\/\//, '').slice(0, 28) + '...');
  console.log('[checkBatch] Auth mode:', svc ? 'service-role' : 'anon');
  const supabase = createClient(url, svc || anon);
  try {
    // 1) Try by UUID id if present
    if (id) {
      const { data, error } = await supabase
        .from('batches')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('[checkBatch] ID query error:', error.message || error);
      } else if (data) {
        console.log('[checkBatch] Found by id:', JSON.stringify(data, null, 2));
        process.exit(0);
      } else {
        console.log('[checkBatch] Not found by id, will try batch_number fallbacks');
      }
    }

    // 2) Fallback to batch_number lookups
    const candidate = id ? null : String(raw).trim();
    if (candidate) {
      // exact
      let { data, error } = await supabase
        .from('batches')
        .select('*')
        .eq('batch_number', candidate)
        .maybeSingle();
      if (error) {
        console.error('[checkBatch] batch_number exact error:', error.message || error);
      } else if (data) {
        console.log('[checkBatch] Found by batch_number (exact):', JSON.stringify(data, null, 2));
        process.exit(0);
      }

      // ilike exact
      let res = await supabase
        .from('batches')
        .select('*')
        .ilike('batch_number', candidate)
        .maybeSingle();
      if (res.error) {
        console.error('[checkBatch] batch_number ilike error:', res.error.message || res.error);
      } else if (res.data) {
        console.log('[checkBatch] Found by batch_number (ilike):', JSON.stringify(res.data, null, 2));
        process.exit(0);
      }

      // contains
      res = await supabase
        .from('batches')
        .select('*')
        .ilike('batch_number', `%${candidate}%`)
        .maybeSingle();
      if (res.error) {
        console.error('[checkBatch] batch_number contains error:', res.error.message || res.error);
      } else if (res.data) {
        console.log('[checkBatch] Found by batch_number (contains):', JSON.stringify(res.data, null, 2));
        process.exit(0);
      }
    }

    console.log('[checkBatch] No match found');
    process.exit(0);
  } catch (e) {
    console.error('[checkBatch] Unexpected error:', e.message || e);
    process.exit(1);
  }
}

main();
