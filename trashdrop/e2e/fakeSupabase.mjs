// A stand-in for Supabase in the browser tests: the built app talks to
// https://ci-placeholder.supabase.co (the placeholder CI builds with), and
// every request to it is answered here, so the tests never reach a real
// project, real accounts or real data. Every other outside host (maps,
// fonts, analytics) is refused, so a test can't pass or fail on the network.
//
// The answers are shaped like Supabase's (Auth: token and user; PostgREST:
// arrays, or one object with "Accept: application/vnd.pgrst.object+json"),
// with the CORS headers a browser needs for a cross-origin call.

export const SUPABASE = 'https://ci-placeholder.supabase.co';

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** A signed-in household account: user, and a session for it */
export function household({ id = '11111111-2222-4333-8444-555555555555', email = 'household@example.test', firstName = 'Ama' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id, aud: 'authenticated', role: 'authenticated', email,
    email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(),
    user_metadata: { first_name: firstName }, app_metadata: { provider: 'email' },
  };
  // An unsigned token: the app only reads its expiry and subject. Built here
  // so the source holds no token-shaped text for the secret scan.
  const accessToken = [b64url({ alg: 'HS256', typ: 'JWT' }), b64url({ sub: id, email, role: 'authenticated', aud: 'authenticated', exp: now + 3600 }), 'test-signature'].join('.');
  return {
    user,
    session: { access_token: accessToken, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'test-refresh', user },
  };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'access-control-expose-headers': 'content-range, x-total-count',
};

/**
 * Route the page's network through the fake.
 *   account:  household() for a valid password, or null (every sign-in refused)
 *   tables:   { table: rows[] } answers for reads; unlisted tables are empty
 *   rpc:      { name: result | (body) => result } answers for database functions
 * Returns the calls made, [{ method, path, body }], for assertions.
 */
export async function fakeSupabase(page, { account = null, tables = {}, rpc = {} } = {}) {
  const calls = [];
  await page.route(/^(?!http:\/\/(localhost|127\.0\.0\.1)[:/]).*/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== SUPABASE) return route.abort('blockedbyclient');
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    let body = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    calls.push({ method: req.method(), path: url.pathname, query: url.search, body });
    const json = (status, data, extra = {}) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json', ...extra }, body: JSON.stringify(data) });

    // Auth
    if (url.pathname === '/auth/v1/token') {
      if (account && body?.password === 'correct-horse') return json(200, account.session);
      return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (url.pathname === '/auth/v1/user') return account ? json(200, account.user) : json(401, { msg: 'not signed in' });
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname.startsWith('/auth/v1/')) return json(200, {});

    // Database functions
    const fn = url.pathname.match(/^\/rest\/v1\/rpc\/(.+)$/)?.[1];
    if (fn) {
      const answer = rpc[fn];
      return json(200, typeof answer === 'function' ? answer(body) : (answer ?? null));
    }

    // Tables (PostgREST)
    const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
    if (table) {
      const rows = tables[table] || [];
      const wantsOne = (req.headers().accept || '').includes('application/vnd.pgrst.object');
      if (req.method() === 'GET' || req.method() === 'HEAD') {
        if (wantsOne) return rows.length ? json(200, rows[0]) : json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows' });
        return json(200, rows, { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
      }
      return json(201, wantsOne ? (body || {}) : [body || {}]);
    }

    // Storage, functions and anything else Supabase serves: nothing there
    return json(404, { message: 'not in the test fake' });
  });
  // Realtime is a websocket: refuse it, as an offline network would
  await page.routeWebSocket(/supabase\.co/, (ws) => ws.close());
  return calls;
}

/** Fail the test on an uncaught error in the page (a crash the household would see) */
export function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
