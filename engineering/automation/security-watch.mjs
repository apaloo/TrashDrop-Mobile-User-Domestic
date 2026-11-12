#!/usr/bin/env node
/*
 * Security watch: checks production the way an outsider would.
 *   1. Probes: requests with only the public app key must be refused or see
 *      no rows (see security-watch-config.json). A control probe must see data.
 *   2. Advisors (when SUPABASE_ACCESS_TOKEN is set): no new ERROR-level
 *      findings, and warning counts no higher than their ceilings.
 *   3. Write policies (same token): no more row-level security write rules
 *      open to every row or to signed-out visitors than the baseline.
 *   4. Log scan (same token): no signed-out caller scanned the API in the
 *      last 24 hours (many tables in one minute, or many missing tables).
 *      Reports minutes and counts only, never IP addresses: the repository
 *      is public.
 * Exits 1 on any failure. Prints a Markdown summary (GITHUB_STEP_SUMMARY)
 * and writes security-watch-result.json for the workflow's issue step.
 *
 * Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (public), and optionally
 *      SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF for the advisors and
 *      the log scan.
 *
 *   node engineering/automation/security-watch.mjs --self-test   logic only, no network
 */
import fs from 'node:fs';
import path from 'node:path';
import { queryLogs } from './supabase-logs.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const config = JSON.parse(fs.readFileSync(path.join(here, 'security-watch-config.json'), 'utf8'));

export function judge(expect, status, rows) {
  const denied = [401, 403, 404].includes(status);
  const empty = status === 200 && Array.isArray(rows) && rows.length === 0;
  const data = status === 200 && Array.isArray(rows) && rows.length > 0;
  if (expect === 'denied') return denied;
  if (expect === 'empty') return empty;
  if (expect === 'denied-or-empty') return denied || empty;
  if (expect === 'data') return data;
  return false;
}

export function checkAdvisors(lints, advisorsConfig) {
  const problems = [];
  const allowed = new Set(advisorsConfig.allowedErrors);
  const seenAllowed = new Set();
  for (const l of lints) {
    if (l.level === 'ERROR') {
      for (const f of l.findings ?? l.items ?? []) {
        const m = f.metadata ?? {};
        const key = `${l.name}:${m.schema}.${m.name}`;
        if (allowed.has(key)) seenAllowed.add(key);
        else problems.push(`New ERROR finding: ${key}`);
      }
    }
    const ceiling = advisorsConfig.ceilings?.[l.name];
    const count = l.count ?? (l.findings ?? []).length;
    if (ceiling !== undefined && count > ceiling) problems.push(`${l.name}: ${count} (ceiling ${ceiling})`);
  }
  const fixed = [...allowed].filter((k) => !seenAllowed.has(k));
  return { problems, fixed };
}

// One row per caller (IP) per minute: signed-out API requests, how many
// tables or functions they touched, and how many asked for one that doesn't
// exist (404). ClickHouse SQL for the Management API logs endpoint.
export const SCAN_SQL = `select toStartOfMinute(timestamp) as minute,
  log_attributes['request.headers.cf_connecting_ip'] as caller,
  count() as requests,
  uniq(regexpExtract(log_attributes['request.path'], '^(/rest/v1/(?:rpc/)?[^?/]*)')) as endpoints,
  countIf(log_attributes['response.status_code'] = '404') as not_found
from logs
where source = 'edge_logs'
  and log_attributes['request.path'] like '/rest/v1/%'
  and coalesce(nullIf(log_attributes['request.sb.jwt.authorization.payload.role'], ''), 'anon') = 'anon'
group by minute, caller
having endpoints > 10 or not_found > 5
order by minute`;

// Rows from SCAN_SQL -> the minutes that look like a scan. Callers are
// numbered, not named, so nothing identifying reaches the public summary.
export function findScans(rows, cfg) {
  const ids = new Map();
  return (rows ?? [])
    .filter((r) => Number(r.endpoints) > cfg.maxEndpointsPerMinute || Number(r.not_found) > cfg.maxNotFoundPerMinute)
    .map((r) => {
      if (!ids.has(r.caller)) ids.set(r.caller, ids.size + 1);
      return { minute: String(r.minute), caller: ids.get(r.caller), requests: Number(r.requests), endpoints: Number(r.endpoints), notFound: Number(r.not_found) };
    });
}

async function logScan(token, ref, cfg) {
  const r = await queryLogs(token, ref, SCAN_SQL, cfg.hours);
  return r.error ? { error: r.error } : { scans: findScans(r.rows, cfg) };
}

// Write policies open to every row or to signed-out visitors (secure
// development principle 10). Counts only: names stay out of the public summary.
export const OPEN_WRITE_POLICIES_SQL = `select count(*)::int as open
from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and p.polcmd in ('a', 'w', 'd', '*')
  and p.polroles <> array[(select oid from pg_roles where rolname = 'service_role')]
  and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') = 'true'
    or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') = 'true'
    or exists (select 1 from pg_roles r where r.oid = any(p.polroles) and r.rolname = 'anon'))`;

export function judgeWritePolicies(count, cfg) {
  const n = Number(count);
  if (!Number.isFinite(n)) return { ok: false, line: 'could not be counted' };
  return n <= cfg.maxOpen
    ? { ok: true, line: `✅ ${n} open (baseline ${cfg.maxOpen})` }
    : { ok: false, line: `❌ ${n} open, baseline ${cfg.maxOpen}: a write rule now lets every signed-in user, or signed-out visitors, change rows` };
}

// Protected business rules (CLAUDE.md: pricing, points, collector payouts)
// live in database objects that the dashboard can change without a pull
// request. Each one is fingerprinted (md5 of its definition and grants) and
// compared with the fingerprints recorded when the owner approved it.
const PROTECTED_FUNCTIONS = [
  ['pricing', 'td_price_digital_bin'], ['pricing', 'td_set_digital_bin_price'], ['pricing', 'td_protect_digital_bin_price'],
  ['pricing', 'td_refund_promotion_on_cancel'], ['pricing', 'increment_promotional_usage'],
  ['points', 'td_redeem_reward'], ['points', 'td_guard_request_write'], ['points', 'td_guard_profile_columns'], ['points', 'get_dashboard_data_optimized'],
  ['payouts', 'td_guard_bin_payment'], ['payouts', 'td_withdrawable_items'], ['payouts', 'td_keep_booked_payout'],
  ['payouts', 'td_record_bin_acceptance'], ['payouts', 'td_bin_collector_share'],
];
const PROTECTED_TRIGGERS = [
  ['pricing', 'digital_bins', 'digital_bins_set_price'], ['pricing', 'digital_bins', 'digital_bins_protect_price'],
  ['pricing', 'digital_bins', 'digital_bins_refund_promotion'],
  ['points', 'pickup_requests', 'aa_td_guard_write'], ['points', 'profiles', 'td_guard_profile_columns'],
  ['payouts', 'bin_payments', 'aa_td_guard_bin_payment'], ['payouts', 'digital_bins', 'ab_td_keep_booked_payout'],
  ['payouts', 'digital_bins', 'ac_td_record_bin_acceptance'],
];
const values = (rows) => rows.map((r) => `(${r.map((v) => `'${v}'`).join(',')})`).join(',');
export const PROTECTED_DEFINITIONS_SQL = `with fns(rule, name) as (values ${values(PROTECTED_FUNCTIONS)}),
trg(rule, tbl, name) as (values ${values(PROTECTED_TRIGGERS)})
select f.rule, 'function ' || f.name as object,
  (select md5(string_agg(pg_get_functiondef(p.oid) || coalesce(array_to_string(p.proacl, ','), ''), '|' order by p.oid::regprocedure::text))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public' where p.proname = f.name) as hash
from fns f
union all
select t.rule, 'trigger ' || t.tbl || '.' || t.name,
  (select md5(pg_get_triggerdef(g.oid) || g.tgenabled::text) from pg_trigger g where g.tgrelid = to_regclass('public.' || t.tbl) and g.tgname = t.name)
from trg t
union all
select 'points', 'view user_stats_dashboard',
  (select md5(pg_get_viewdef(c.oid) || coalesce(array_to_string(c.relacl, ','), '')) from pg_class c where c.oid = to_regclass('public.user_stats_dashboard'))
union all
select 'pricing', 'policies promotional_usage',
  (select md5(coalesce(string_agg(p.polname || p.polcmd::text || p.polroles::text || coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''), '|' order by p.polname), '')
          || (select coalesce(array_to_string(relacl, ','), '') || relrowsecurity::text from pg_class where oid = to_regclass('public.promotional_usage')))
     from pg_policy p where p.polrelid = to_regclass('public.promotional_usage'))
order by 1, 2`;

export function judgeProtected(rows, expected) {
  const live = Object.fromEntries((rows || []).map((r) => [r.object, r]));
  const problems = [];
  for (const [object, hash] of Object.entries(expected)) {
    const row = live[object];
    if (!row || !row.hash) problems.push(`${object} is missing`);
    else if (row.hash !== hash) problems.push(`${object} (${row.rule}) has changed`);
  }
  for (const object of Object.keys(live)) {
    if (!(object in expected)) problems.push(`${object} has no recorded fingerprint`);
  }
  return problems;
}

async function query(token, ref, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function probe(base, key, p) {
  const res = await fetch(base + p.path, {
    method: p.method,
    headers: { apikey: key, 'content-type': 'application/json' },
    body: p.body ? JSON.stringify(p.body) : undefined,
  });
  let rows;
  try { rows = await res.json(); } catch { rows = undefined; }
  return { status: res.status, rows };
}

async function main() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!base || !key) {
    // Not set up yet (repository variables). Pull requests only need the
    // script to load; scheduled runs must fail so the gap gets noticed.
    const msg = 'Security watch not configured: set the SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY repository variables.';
    if (process.env.GITHUB_EVENT_NAME === 'pull_request') { console.log(msg + ' Skipped on this pull request.'); process.exit(0); }
    fs.writeFileSync('security-watch-result.json', JSON.stringify({ failures: [msg] }, null, 2));
    console.error(msg); process.exit(2);
  }

  const lines = ['### Security watch', '', '| Probe | What | Expected | Result |', '|---|---|---|---|'];
  const failures = [];
  for (const p of config.probes) {
    let ok = false; let result;
    try {
      const r = await probe(base, key, p);
      ok = judge(p.expect, r.status, r.rows);
      result = `HTTP ${r.status}${Array.isArray(r.rows) ? `, ${r.rows.length} row(s)` : ''}`;
    } catch (e) { result = `error: ${e.message}`; }
    lines.push(`| ${p.id} | ${p.what} | ${p.expect} | ${ok ? '✅' : '❌'} ${result} |`);
    if (!ok) failures.push(`${p.id} ${p.what}: expected ${p.expect}, got ${result}`);
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN; const ref = process.env.SUPABASE_PROJECT_REF;
  if (token && ref) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/security`, { headers: { authorization: `Bearer ${token}` } });
    if (res.ok) {
      const body = await res.json();
      const { problems, fixed } = checkAdvisors(body.lints ?? body, config.advisors);
      lines.push('', `**Advisors:** ${problems.length ? '❌ ' + problems.length + ' problem(s)' : '✅ no new ERROR findings, ceilings held'}`);
      problems.forEach((p) => { lines.push(`- ${p}`); failures.push(p); });
      if (fixed.length) lines.push('', `Fixed since the baseline (delete from allowedErrors): ${fixed.join(', ')}`);
    } else {
      lines.push('', `**Advisors:** could not be read (HTTP ${res.status}); probes still ran.`);
    }
  } else {
    lines.push('', '**Advisors:** skipped (set SUPABASE_ACCESS_TOKEN and the SUPABASE_PROJECT_REF variable to enable).');
  }

  if (token && ref) {
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query: OPEN_WRITE_POLICIES_SQL }),
      });
      if (res.ok) {
        const rows = await res.json();
        const r = judgeWritePolicies(rows?.[0]?.open, config.writePolicies);
        lines.push('', `**Write policies:** ${r.line}`);
        if (!r.ok) failures.push(`Write policies: ${r.line.replace(/^❌ /, '')}. List them privately (engineering/runbooks/database-function-review.md) and fix in a migration.`);
      } else {
        lines.push('', `**Write policies:** could not be read (HTTP ${res.status}); probes still ran.`);
      }
    } catch (e) {
      lines.push('', `**Write policies:** could not be read (${e.message}).`);
    }
  } else {
    lines.push('', '**Write policies:** skipped (needs the same token and project ref as the advisors).');
  }

  if (token && ref) {
    try {
      const problems = judgeProtected(await query(token, ref, PROTECTED_DEFINITIONS_SQL), config.protectedDefinitions.objects);
      const n = Object.keys(config.protectedDefinitions.objects).length;
      lines.push('', `**Protected rules:** ${problems.length ? `❌ ${problems.length} of ${n} database objects differ from what the owner approved` : `✅ all ${n} database objects match what the owner approved`}`);
      problems.forEach((p) => {
        lines.push(`- ${p}`);
        failures.push(`Protected rules: ${p}. Changed without an approved pull request? Compare it with its migration and restore it; if the owner approved it, record the new fingerprint (engineering/runbooks/protected-rules.md).`);
      });
    } catch (e) {
      lines.push('', `**Protected rules:** could not be read (${e.message}).`);
    }
  } else {
    lines.push('', '**Protected rules:** skipped (needs the same token and project ref as the advisors).');
  }

  const scanCfg = config.logScan;
  if (token && ref) {
    let r;
    try { r = await logScan(token, ref, scanCfg); } catch (e) { r = { error: e.message }; }
    if (r.error) {
      lines.push('', `**Log scan:** could not be read (${r.error}); probes still ran.`);
    } else if (!r.scans.length) {
      lines.push('', `**Log scan:** ✅ no signed-out caller scanned the API in the last ${scanCfg.hours} hours.`);
    } else {
      lines.push('', `**Log scan:** ❌ ${r.scans.length} minute(s) of scanning by signed-out callers in the last ${scanCfg.hours} hours`, '',
        '| Minute (UTC) | Caller | Requests | Tables or functions | Not found |', '|---|---|---|---|---|');
      r.scans.forEach((x) => lines.push(`| ${x.minute} | #${x.caller} | ${x.requests} | ${x.endpoints} | ${x.notFound} |`));
      const callers = new Set(r.scans.map((x) => x.caller)).size;
      failures.push(`Log scan: ${callers} signed-out caller(s) scanned the API (${r.scans.map((x) => x.minute).join(', ')} UTC). If every probe above passed, nothing private was readable: P2, follow the runbook. Caller details are in the logs, not here.`);
    }
  } else {
    lines.push('', '**Log scan:** skipped (needs the same token and project ref as the advisors).');
  }

  const summary = lines.join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  fs.writeFileSync('security-watch-result.json', JSON.stringify({ failures }, null, 2));
  process.exit(failures.length ? 1 : 0);
}

function selfTest() {
  const assert = (ok, what) => { if (!ok) { console.error(`self-test failed: ${what}`); process.exit(1); } };
  assert(judge('denied', 401) && judge('empty', 200, []) && !judge('empty', 200, [{}]) && judge('data', 200, [{}]), 'judge');
  assert(judge('denied-or-empty', 200, []) && !judge('denied', 200, []), 'judge denied-or-empty');
  const adv = checkAdvisors([{ name: 'x', level: 'ERROR', findings: [{ metadata: { schema: 'public', name: 'a' } }] }, { name: 'w', level: 'WARN', count: 5 }],
    { allowedErrors: ['x:public.a', 'x:public.gone'], ceilings: { w: 4 } });
  assert(adv.problems.length === 1 && adv.problems[0].startsWith('w: 5') && adv.fixed[0] === 'x:public.gone', 'checkAdvisors');
  const cfg = { maxEndpointsPerMinute: 40, maxNotFoundPerMinute: 25 };
  // Shapes measured on 2026-11-11: busy real visitors, then one scan.
  const rows = [
    { minute: '2026-11-11 05:50:00', caller: 'a', requests: 24, endpoints: 15, not_found: 0 },
    { minute: '2026-11-11 22:22:00', caller: 'b', requests: 1663, endpoints: 150, not_found: 137 },
    { minute: '2026-11-11 22:23:00', caller: 'b', requests: 40, endpoints: 12, not_found: 30 },
    { minute: '2026-11-11 23:00:00', caller: 'c', requests: 50, endpoints: 41, not_found: 0 },
  ];
  const s = findScans(rows, cfg);
  assert(s.length === 3 && s.every((x) => x.minute !== '2026-11-11 05:50:00'), 'findScans picks scans only');
  assert(s[0].caller === 1 && s[1].caller === 1 && s[2].caller === 2, 'findScans numbers callers');
  assert(!JSON.stringify(s).includes('"b"'), 'findScans hides caller addresses');
  assert(findScans(undefined, cfg).length === 0, 'findScans with no rows');
  assert(config.logScan.maxEndpointsPerMinute > 15 && config.logScan.hours <= 24, 'logScan config (above normal traffic; API allows 24 h at most)');
  assert(/having endpoints > 10/.test(SCAN_SQL) && 10 < config.logScan.maxEndpointsPerMinute && 5 < config.logScan.maxNotFoundPerMinute, 'SQL prefilter below the limits');
  assert(judgeWritePolicies(2, { maxOpen: 2 }).ok && !judgeWritePolicies(3, { maxOpen: 2 }).ok && !judgeWritePolicies(undefined, { maxOpen: 2 }).ok, 'judgeWritePolicies');
  assert(/^select count\(\*\)::int as open\s*$/.test(OPEN_WRITE_POLICIES_SQL.split('from')[0]), 'write policy check selects a count, not names');
  assert(Number.isInteger(config.writePolicies?.maxOpen), 'writePolicies config');
  const exp = { 'function a': 'h1', 'view b': 'h2' };
  assert(judgeProtected([{ rule: 'x', object: 'function a', hash: 'h1' }, { rule: 'x', object: 'view b', hash: 'h2' }], exp).length === 0, 'judgeProtected: unchanged');
  const pr = judgeProtected([{ rule: 'x', object: 'function a', hash: 'zz' }, { rule: 'x', object: 'view b', hash: null }, { rule: 'x', object: 'trigger c', hash: 'h3' }], exp);
  assert(pr.length === 3 && /changed/.test(pr[0]) && /missing/.test(pr[1]) && /no recorded/.test(pr[2]), 'judgeProtected: changed, missing, unrecorded');
  assert(judgeProtected(undefined, exp).length === 2, 'judgeProtected: nothing read means everything missing');
  const recorded = Object.keys(config.protectedDefinitions?.objects || {});
  const listed = [...PROTECTED_FUNCTIONS.map(([, n]) => `function ${n}`), ...PROTECTED_TRIGGERS.map(([, t, n]) => `trigger ${t}.${n}`),
    'view user_stats_dashboard', 'policies promotional_usage'];
  assert(listed.length === recorded.length && listed.every((o) => recorded.includes(o)), 'every protected object has a recorded fingerprint');
  assert(Object.values(config.protectedDefinitions.objects).every((h) => /^[0-9a-f]{32}$/.test(h)), 'fingerprints are md5');
  console.log(`self-test passed (${config.probes.length} probes configured)`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  if (process.argv.includes('--self-test')) selfTest();
  else if (process.argv.includes('--protected-fingerprints')) {
    // After an approved change: print the live fingerprints to record in the config
    const token = process.env.SUPABASE_ACCESS_TOKEN; const ref = process.env.SUPABASE_PROJECT_REF;
    if (!token || !ref) { console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF.'); process.exit(2); }
    query(token, ref, PROTECTED_DEFINITIONS_SQL)
      .then((rows) => console.log(JSON.stringify(Object.fromEntries(rows.map((r) => [r.object, r.hash])), null, 2)))
      .catch((e) => { console.error(e.message); process.exit(1); });
  } else main();
}
