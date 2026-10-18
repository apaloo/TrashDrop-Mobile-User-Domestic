/**
 * Service-role Supabase client for the WhatsApp functions.
 *
 * This project carries TWO similarly named variables, and they do not hold what
 * their names suggest:
 *
 *   SUPABASE_SERVICE_ROLE      - the real service_role key (what the older
 *                                batch functions already use)
 *   SUPABASE_SERVICE_ROLE_KEY  - actually holds the ANON key
 *
 * Picking the wrong one fails silently: every RPC is refused by RLS and every
 * booking dies with a permission error that looks like a bug in the flow. So
 * rather than trusting either name, the key is chosen by what it is:
 *   - a new Supabase secret key (sb_secret_...), which has service-role access
 *   - a legacy JWT whose role claim is service_role
 * Anon JWTs and publishable keys (sb_publishable_...) are never used, whatever
 * they are called.
 */

const { createClient } = require('@supabase/supabase-js');

/** Read the `role` claim out of a Supabase JWT without verifying it. */
function jwtRole(key) {
  try {
    const [, payload] = key.split('.');
    if (!payload) return null;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
      + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')).role || null;
  } catch {
    return null;
  }
}

/** What kind of key this is, for picking and for log messages (never the key itself). */
function keyKind(key) {
  if (key.startsWith('sb_secret_')) return 'secret';
  if (key.startsWith('sb_publishable_')) return 'publishable';
  return jwtRole(key);
}

function resolveServiceRoleKey(logPrefix) {
  const candidates = [
    ['SUPABASE_SERVICE_ROLE', process.env.SUPABASE_SERVICE_ROLE],
    ['SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY],
  ];

  for (const [name, key] of candidates) {
    if (!key) continue;
    const kind = keyKind(key);
    if (kind === 'secret' || kind === 'service_role') return key;
    console.warn(`${logPrefix} ${name} is set but is a "${kind}" key, not a secret/service_role key — ignoring it`);
  }

  throw new Error(
    `${logPrefix} No service key configured. Set SUPABASE_SERVICE_ROLE to the secret ` +
    '(sb_secret_...) or service_role key from Supabase → Settings → API Keys ' +
    '(the anon or publishable key will not work).'
  );
}

/**
 * @param {string} logPrefix - e.g. '[WhatsApp Webhook]'
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getServiceClient(logPrefix = '[Supabase Admin]') {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  if (!url) throw new Error(`${logPrefix} Missing SUPABASE_URL`);

  return createClient(url, resolveServiceRoleKey(logPrefix), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

module.exports = { getServiceClient, resolveServiceRoleKey, jwtRole, keyKind };
