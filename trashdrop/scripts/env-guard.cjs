/*
 * Every REACT_APP_* variable is written into the JavaScript that ships to
 * every visitor's browser. This guard stops a build that would publish a
 * server secret that way: a Supabase service role or secret key, a private
 * key, or a variable whose name says it is a secret. Used by vite.config.mjs (copied from the admin site);
 * `node scripts/env-guard.cjs --self-test` checks the guard itself.
 */
const SECRET_NAME = /SECRET|SERVICE_ROLE|PRIVATE_KEY|PASSWORD|BEARER/i;

function jwtRole(value) {
  const parts = String(value).split('.');
  if (parts.length !== 3 || !parts[0].startsWith('eyJ')) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role || null;
  } catch {
    return null;
  }
}

// Returns one line per problem; an empty list means the variables are safe to ship.
function findPublishedSecrets(env) {
  const problems = [];
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('REACT_APP_') || !value) continue;
    if (SECRET_NAME.test(name)) problems.push(`${name}: the name says it is a secret`);
    else if (/^sb_secret_/.test(value)) problems.push(`${name}: holds a Supabase secret key`);
    else if (jwtRole(value) === 'service_role') problems.push(`${name}: holds a Supabase service role key`);
    else if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value)) problems.push(`${name}: holds a private key`);
  }
  return problems;
}

module.exports = { findPublishedSecrets };

if (require.main === module && process.argv.includes('--self-test')) {
  const assert = require('assert');
  const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig`;
  assert.deepStrictEqual(findPublishedSecrets({
    REACT_APP_SUPABASE_URL: 'https://x.supabase.co',
    REACT_APP_SUPABASE_ANON_KEY: 'sb_publishable_abc',
    REACT_APP_LEGACY_ANON: jwt('anon'),
    NOT_PUBLISHED_SECRET: 'sb_secret_abc',
  }), []);
  assert.strictEqual(findPublishedSecrets({ REACT_APP_KEY: 'sb_secret_abc' }).length, 1);
  assert.strictEqual(findPublishedSecrets({ REACT_APP_KEY: jwt('service_role') }).length, 1);
  assert.strictEqual(findPublishedSecrets({ REACT_APP_TWITTER_BEARER_TOKEN: 'x' }).length, 1);
  assert.strictEqual(findPublishedSecrets({ REACT_APP_KEY: '-----BEGIN RSA PRIVATE KEY-----\nx' }).length, 1);
  console.log('env-guard self-test passed');
}
