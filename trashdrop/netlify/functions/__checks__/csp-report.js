// node netlify/functions/__checks__/csp-report.js: offline checks for the CSP report collector
const assert = require('assert');
const { handler, summarise } = require('../csp-report.js');

(async () => {
  const logged = [];
  const realLog = console.log;
  console.log = (line) => logged.push(JSON.parse(line).csp);
  const post = (body, extra = {}) => handler({ httpMethod: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), ...extra });

  // report-uri format (Chrome, Firefox, Safari)
  let r = await post({ 'csp-report': {
    'document-uri': 'https://app.trashdrops.com/dashboard?phone=0244000000',
    'violated-directive': 'connect-src https://*.supabase.co',
    'effective-directive': 'connect-src',
    'blocked-uri': 'https://api.example-geocoder.com/v1/search?q=Vitin+Estate',
    'source-file': 'https://app.trashdrops.com/static/index-abc.js',
  } });
  assert.strictEqual(r.statusCode, 204);
  assert.deepStrictEqual(logged.pop(), {
    site: 'https://app.trashdrops.com', directive: 'connect-src',
    blocked: 'https://api.example-geocoder.com', source: 'https://app.trashdrops.com', disposition: 'report',
  });

  // Reporting API format (report-to), several at once; inline scripts keep their keyword
  r = await post([
    { type: 'csp-violation', url: 'https://trashdrops.com/login', body: { documentURL: 'https://trashdrops.com/login', effectiveDirective: 'script-src-elem', blockedURL: 'inline', disposition: 'report' } },
    { type: 'deprecation', url: 'https://trashdrops.com/', body: {} },
  ]);
  assert.strictEqual(r.statusCode, 204);
  assert.strictEqual(logged.length, 1);
  assert.deepStrictEqual(logged.pop(), { site: 'https://trashdrops.com', directive: 'script-src-elem', blocked: 'inline', source: null, disposition: 'report' });

  // Never logs full URLs (paths, queries)
  const s = summarise({ 'csp-report': { 'document-uri': 'https://app.trashdrops.com/x', 'effective-directive': 'img-src', 'blocked-uri': 'https://tiles.example/a/b.png?token=secret' } });
  assert.ok(!JSON.stringify(s).includes('token') && !JSON.stringify(s).includes('/a/b'));

  // Dropped: other sites, not a report, too big, not JSON, wrong method
  await post({ 'csp-report': { 'document-uri': 'https://evil.example/', 'effective-directive': 'script-src', 'blocked-uri': 'https://x.example' } });
  await post({ hello: 'world' });
  assert.strictEqual(logged.length, 0);
  assert.strictEqual((await post('x'.repeat(17 * 1024))).statusCode, 413);
  assert.strictEqual((await post('not json')).statusCode, 400);
  assert.strictEqual((await handler({ httpMethod: 'GET' })).statusCode, 405);

  console.log = realLog;
  console.log('csp-report checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
