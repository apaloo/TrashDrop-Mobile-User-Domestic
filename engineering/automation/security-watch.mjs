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
import { applyPublicDefaults, publicDefaults } from './supabase-public.mjs';

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

// Functions that run with their owner's rights, can be run by any signed-in
// user, and show no check of who is calling (secure development principle 8):
// those that write and take an id, and those that read personal data. Counts
// only; list them with the query in engineering/runbooks/database-function-review.md.
const CALLER_CHECKS = String.raw`auth\.uid\(\)|auth\.role\(\)|td_assert_self_or_staff|td_can_manage_requests|td_is_staff|td_is_active_collector|td_my_collector|can_do\(|td_my_team|td_area_report_for`;
export const UNCHECKED_FUNCTIONS_SQL = `select
  count(*) filter (where pg_get_function_identity_arguments(p.oid) ~* 'uuid|_id'
                     and p.prosrc ~* '\\m(insert\\s+into|update\\s+\\w|delete\\s+from)')::int as writers,
  count(*) filter (where p.prosrc ~* 'auth\\.users|\\mphone\\M')::int as personal_reads
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.prosecdef and p.prorettype <> 'trigger'::regtype
  and has_function_privilege('authenticated', p.oid, 'execute')
  and not (p.prosrc ~* '${CALLER_CHECKS}')`;

export function judgeUnchecked(row, cfg) {
  const w = Number(row?.writers); const r = Number(row?.personal_reads);
  if (!Number.isFinite(w) || !Number.isFinite(r)) return { ok: false, line: 'could not be counted' };
  const ok = w <= cfg.maxWriters && r <= cfg.maxPersonalReads;
  return { ok, line: `${ok ? '✅' : '❌'} ${w} that write (baseline ${cfg.maxWriters}), ${r} that read personal data (baseline ${cfg.maxPersonalReads})` };
}

// Tables, views and materialized views a signed-out caller can read past
// row-level security (tables without it, materialized views, views that run
// as their owner) that hold personal columns. Count only.
export const PERSONAL_EXPOSURE_SQL = `select count(*)::int as exposed
from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where has_table_privilege('anon', c.oid, 'select')
  and ((c.relkind = 'r' and not c.relrowsecurity) or c.relkind = 'm'
       or (c.relkind = 'v' and not coalesce(c.reloptions::text[] && array['security_invoker=true', 'security_invoker=on'], false)))
  and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
              and a.attname ~* '^(email|phone|phone_number|first_name|last_name|client_momo|momo_number|address)$')`;

export function judgePersonalExposure(count, cfg) {
  const n = Number(count);
  if (!Number.isFinite(n)) return { ok: false, line: 'could not be counted' };
  return n <= cfg.maxExposed
    ? { ok: true, line: `✅ ${n} (baseline ${cfg.maxExposed})` }
    : { ok: false, line: `❌ ${n}, baseline ${cfg.maxExposed}: signed-out callers can read personal data past row-level security` };
}

// Protected business rules (CLAUDE.md: pricing, points, collector payouts)
// live in database objects that the dashboard can change without a pull
// request. Each one is fingerprinted (md5 of its definition and grants) and
// compared with the fingerprints recorded when the owner approved it.
const PROTECTED_FUNCTIONS = [
  ['pricing', 'td_price_digital_bin'], ['pricing', 'td_set_digital_bin_price'], ['pricing', 'td_protect_digital_bin_price'],
  ['pricing', 'td_refund_promotion_on_cancel'], ['pricing', 'increment_promotional_usage'],
  ['points', 'td_redeem_reward'], ['points', 'td_guard_request_write'], ['points', 'td_guard_profile_columns'], ['points', 'get_dashboard_data_optimized'],
  ['points', 'td_guard_dumping_insert'],
  ['payouts', 'td_guard_bin_payment'], ['payouts', 'td_withdrawable_items'], ['payouts', 'td_keep_booked_payout'],
  ['payouts', 'td_record_bin_acceptance'], ['payouts', 'td_bin_collector_share'], ['payouts', 'td_guard_cleanup_fee'],
];
const PROTECTED_TRIGGERS = [
  ['pricing', 'digital_bins', 'digital_bins_set_price'], ['pricing', 'digital_bins', 'digital_bins_protect_price'],
  ['pricing', 'digital_bins', 'digital_bins_refund_promotion'],
  ['points', 'pickup_requests', 'aa_td_guard_write'], ['points', 'profiles', 'td_guard_profile_columns'],
  ['points', 'illegal_dumping_mobile', 'aa_td_guard_insert'],
  ['payouts', 'bin_payments', 'aa_td_guard_bin_payment'], ['payouts', 'digital_bins', 'ab_td_keep_booked_payout'],
  ['payouts', 'digital_bins', 'ac_td_record_bin_acceptance'], ['payouts', 'illegal_dumping_mobile', 'ab_td_guard_cleanup_fee'],
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
union all
select 'points', 'policies rewards_redemption',
  (select md5(coalesce(string_agg(p.polname || p.polcmd::text || p.polroles::text || coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''), '|' order by p.polname), '')
          || (select coalesce(array_to_string(relacl, ','), '') || relrowsecurity::text from pg_class where oid = to_regclass('public.rewards_redemption')))
     from pg_policy p where p.polrelid = to_regclass('public.rewards_redemption'))
order by 1, 2`;

// Access control (TD61, 2026-11-13): the functions and row-level policies
// that decide what an account can see and do (roles, areas, volunteer teams,
// staff, capabilities). A flaw here is in the logic, so the caller-check count
// above can't see it; instead any change is noticed and must be reviewed in a
// pull request before its new fingerprint is recorded.
export const ACCESS_FUNCTIONS = [
  'request_account_role', 'admin_review_account_role', 'admin_set_account_area', 'my_access', 'td_account_role_on_signup',
  'team_accept_invite', 'team_create_invite', 'team_leave', 'team_remove_member', 'team_revoke_invite', 'team_set_role',
  'td_team_of', 'td_effective_account', 'td_my_role', 'td_my_team', 'td_my_area', 'td_my_assign_region', 'td_in_my_area',
  'td_is_staff', 'can_do', 'has_any_role', 'td_capability_roles',
];
export const ACCESS_TABLES = ['account_roles', 'staff_admins', 'team_members', 'team_invites', 'illegal_dumping_mobile'];
export const ACCESS_DEFINITIONS_SQL = `select 'access' as rule, 'function ' || f.name as object,
  (select md5(string_agg(pg_get_functiondef(p.oid) || coalesce(array_to_string(p.proacl, ','), ''), '|' order by p.oid::regprocedure::text))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public' where p.proname = f.name) as hash
from unnest(array[${ACCESS_FUNCTIONS.map((n) => `'${n}'`).join(',')}]) as f(name)
union all
select 'access', 'policies ' || t.name,
  (select md5(coalesce(string_agg(p.polname || p.polcmd::text || p.polroles::text || coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''), '|' order by p.polname), '')
          || (select coalesce(array_to_string(relacl, ','), '') || relrowsecurity::text from pg_class where oid = to_regclass('public.' || t.name)))
     from pg_policy p where p.polrelid = to_regclass('public.' || t.name))
from unnest(array[${ACCESS_TABLES.map((n) => `'${n}'`).join(',')}]) as t(name)
order by 2`;

export function judgeProtected(rows, expected) {
  const live = Object.fromEntries((rows || []).map((r) => [r.object, r]));
  const problems = [];
  for (const [object, hash] of Object.entries(expected)) {
    const row = live[object];
    if (!row || !row.hash) problems.push(`${object} is missing`);
    else if (row.hash !== String(hash).replace(/^md5:/, '')) problems.push(`${object} (${row.rule}) has changed`);
  }
  for (const object of Object.keys(live)) {
    if (!(object in expected)) problems.push(`${object} has no recorded fingerprint`);
  }
  return problems;
}

// Capacity (TD20): the performance advisor's findings (unindexed foreign keys,
// per-row auth.uid() in policies) cost nothing while tables are small. Reported
// every day, never a failure: when a threshold is crossed, schedule TD20.
const CAPACITY_SQL = `
select (select relname from pg_stat_user_tables where schemaname = 'public' order by n_live_tup desc limit 1) as largest_table,
       (select n_live_tup::bigint from pg_stat_user_tables where schemaname = 'public' order by n_live_tup desc limit 1) as largest_rows,
       pg_database_size(current_database())::bigint as db_bytes`;

export function judgeCapacity(row, cfg) {
  if (!row || row.largest_rows == null) return { line: 'could not be read', due: false };
  const mb = Math.round(Number(row.db_bytes) / 1048576);
  const rows = Number(row.largest_rows);
  const due = rows >= cfg.revisitRows || mb >= cfg.revisitMb;
  const what = `largest table ${row.largest_table} ≈ ${rows.toLocaleString('en-GB')} rows, database ${mb} MB`;
  return { due, line: due ? `⚠️ ${what}: past the TD20 threshold (${cfg.revisitRows.toLocaleString('en-GB')} rows or ${cfg.revisitMb} MB), schedule the database performance work` : `✅ ${what} (TD20 waits until ${cfg.revisitRows.toLocaleString('en-GB')} rows or ${cfg.revisitMb} MB)` };
}

// Migration ledger (TD18): every migration production has recorded must have
// its file in one of the three repositories, so nothing applied is lost. A
// file matches by its version prefix or by the migration's name (the admin
// repository names files by date and name).
export const MIGRATION_LEDGER_SQL = `select version, coalesce(name, '') as name from supabase_migrations.schema_migrations order by version`;

export function judgeLedger(rows, files, cfg) {
  if (!Array.isArray(rows) || !Array.isArray(files) || files.length === 0) {
    return { ok: false, missing: [], line: 'could not be read' };
  }
  const missing = rows.filter((r) => !files.some((f) => f.startsWith(String(r.version)) || (r.name && f.includes(r.name))))
    .map((r) => `${r.version} ${r.name}`.trim());
  const ok = missing.length <= cfg.maxMissing;
  return {
    ok, missing,
    line: ok
      ? `✅ all ${rows.length} migrations production recorded have their file (${files.length} files in ${cfg.repos.length} repositories)`
      : `❌ ${missing.length} migration(s) applied to production have no file in any repository: ${missing.join(', ')}`,
  };
}

async function listMigrationFiles(repos) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'trashdrop-security-watch' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const files = [];
  for (const { repo, path: dir } of repos) {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${dir}?ref=main`, { headers });
    if (!res.ok) throw new Error(`${repo}: HTTP ${res.status}`);
    (await res.json()).forEach((f) => { if (f.name.endsWith('.sql')) files.push(f.name); });
  }
  return files;
}

// Elevated functions anyone can call whose caller check runs only when
// someone is signed in ("auth.uid() IS NOT NULL AND ..."): a signed-out call
// skips it. validate_cashout returned any collector's balance this way
// (fixed 20261112165513). Yes/no helpers such as td_is_staff are fine.
export const SKIPPED_CHECK_SQL = `select count(*)::int as skipped from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
  and has_function_privilege('anon', p.oid, 'execute')
  and p.prorettype <> 'boolean'::regtype
  and p.prosrc ~* 'auth\\.uid\\(\\)\\s+is\\s+not\\s+null\\s+and'`;

export function judgeSkippedCheck(count, cfg) {
  if (!Number.isInteger(count)) return { ok: false, line: 'could not be read' };
  return count <= cfg.max
    ? { ok: true, line: `✅ ${count} elevated function(s) anyone can call skip their caller check when signed out (at most ${cfg.max})` }
    : { ok: false, line: `❌ ${count} elevated function(s) anyone can call skip their caller check when signed out (at most ${cfg.max})` };
}

// Owned domains (TD58): trashdrop.app belongs to someone else, yet bin QR
// links, a guest account's email and database functions used it. Counts
// only: QR links not on app.trashdrops.com, accounts that can sign in with an
// email on an unowned TrashDrop domain, functions naming one in a URL or an
// email address (settings such as trashdrop.skip_coverage are not domains).
export const OWNED_DOMAINS_SQL = `select
  (select count(*)::int from public.digital_bins
    where qr_code_url is not null and qr_code_url !~ '^https://app\\.trashdrops\\.com/bin/') as bins,
  (select count(*)::int from auth.users
    where email ~* '@([a-z0-9-]+\\.)*trashdrops?\\.[a-z]{2,}$' and email !~* '@([a-z0-9-]+\\.)*trashdrops\\.com$'
      and banned_until is distinct from 'infinity') as accounts,
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.prokind in ('f', 'p') and p.prosrc ~* '(https?://|@)([a-z0-9-]+\\.)*trashdrop\\.[a-z]{2,}') as functions`;

export function judgeOwnedDomains(row, cfg) {
  if (!row || ![row.bins, row.accounts, row.functions].every(Number.isInteger)) return { ok: false, line: 'could not be read' };
  const total = row.bins + row.accounts + row.functions;
  const detail = `${row.bins} bin QR link(s) off app.trashdrops.com, ${row.accounts} account(s) able to sign in on an unowned TrashDrop domain, ${row.functions} function(s) naming one`;
  return total <= cfg.max ? { ok: true, line: `✅ ${detail}` } : { ok: false, line: `❌ ${detail}` };
}

// Money and points writes (Phase 13, from the TD54 audit): tables with money or
// points columns that signed-in users can write. Each one in the reviewed list
// was checked (a guard trigger keeps amounts on the server, or no balance
// reads it); any other table is new and must be reviewed before it ships.
export function moneyWritesSql(reviewed) {
  const list = reviewed.map((t) => `'${String(t).replace(/'/g, "''")}'`).join(',');
  return `with money_tables as (
  select distinct c.oid, c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where c.relkind = 'r'
    and a.attname ~* '(fee|price|amount|payout|earning|points|balance|share|subsidy|bill|cost|tip|reward|bonus|cashback|commission|wallet|credit)'
    and a.attname !~* '(_at$|_id$|_ids$|currency|_type$|description|name|note|status)'
)
select count(*)::int as unreviewed from money_tables m
where m.relname not in (${list})
  and (has_table_privilege('authenticated', m.oid, 'INSERT') or has_table_privilege('authenticated', m.oid, 'UPDATE'))
  and exists (select 1 from pg_policy p where p.polrelid = m.oid and p.polcmd in ('a','w','*')
              and ('{0}'::oid[] && p.polroles or exists (select 1 from pg_roles r where r.oid = any(p.polroles) and r.rolname in ('authenticated','public'))))`;
}

export function judgeMoneyWrites(count, cfg) {
  if (!Number.isInteger(count)) return { ok: false, line: 'could not be read' };
  return count === 0
    ? { ok: true, line: `✅ no unreviewed table with money or points columns is writable by signed-in users (${cfg.reviewed.length} reviewed)` }
    : { ok: false, line: `❌ ${count} table(s) with money or points columns are writable by signed-in users and not reviewed` };
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
  applyPublicDefaults(); // public values from supabase-public.json when the variables are unset
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
      const r = judgePersonalExposure((await query(token, ref, PERSONAL_EXPOSURE_SQL))?.[0]?.exposed, config.personalExposure);
      lines.push('', `**Personal data open to signed-out callers:** ${r.line}`);
      if (!r.ok) failures.push(`Personal data: ${r.line.replace(/^❌ /, '')}. List them privately (engineering/runbooks/database-function-review.md) and revoke or add row-level security.`);
    } catch (e) {
      lines.push('', `**Personal data open to signed-out callers:** could not be read (${e.message}).`);
    }
  }

  if (token && ref) {
    try {
      const r = judgeUnchecked((await query(token, ref, UNCHECKED_FUNCTIONS_SQL))?.[0], config.uncheckedFunctions);
      lines.push('', `**Functions without a caller check:** ${r.line}`);
      if (!r.ok) failures.push(`Functions without a caller check: ${r.line.replace(/^❌ /, '')}. A signed-in user can run them for anyone. List them privately (engineering/runbooks/database-function-review.md) and add a check or make them server-only.`);
    } catch (e) {
      lines.push('', `**Functions without a caller check:** could not be read (${e.message}).`);
    }
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

  if (token && ref && config.accessDefinitions?.objects) {
    try {
      const problems = judgeProtected(await query(token, ref, ACCESS_DEFINITIONS_SQL), config.accessDefinitions.objects);
      const n = Object.keys(config.accessDefinitions.objects).length;
      lines.push('', `**Access control:** ${problems.length ? `❌ ${problems.length} of ${n} database objects changed since they were reviewed` : `✅ all ${n} database objects as reviewed`}`);
      problems.forEach((p) => {
        lines.push(`- ${p}`);
        failures.push(`Access control: ${p}. Who can see or change what may have changed. Review the change in its pull request (can an account give itself more access?), then record the new fingerprint (engineering/runbooks/database-function-review.md §Access control).`);
      });
    } catch (e) {
      lines.push('', `**Access control:** could not be read (${e.message}).`);
    }
  }

  if (token && ref) {
    try {
      const r = judgeCapacity((await query(token, ref, CAPACITY_SQL))?.[0], config.capacity);
      lines.push('', `**Capacity (information, never fails):** ${r.line}`);
    } catch (e) {
      lines.push('', `**Capacity:** could not be read (${e.message}).`);
    }
  }

  if (token && ref) {
    try {
      const r = judgeLedger(await query(token, ref, MIGRATION_LEDGER_SQL), await listMigrationFiles(config.migrationLedger.repos), config.migrationLedger);
      lines.push('', `**Migration ledger:** ${r.line}`);
      if (!r.ok) failures.push(`Migration ledger: ${r.missing.length} migration(s) applied to production have no file in any repository (${r.missing.join(', ')}). Add each file under its applied version (ADR-001).`);
    } catch (e) {
      lines.push('', `**Migration ledger:** could not be read (${e.message}).`);
    }
  }

  if (token && ref) {
    try {
      const r = judgeSkippedCheck((await query(token, ref, SKIPPED_CHECK_SQL))?.[0]?.skipped, config.skippedCallerCheck);
      lines.push('', `**Caller checks skipped when signed out:** ${r.line}`);
      if (!r.ok) failures.push(`Caller checks: ${r.line.replace(/^❌ /, '')}. List them privately (engineering/runbooks/database-function-review.md) and revoke signed-out access or check the caller every time.`);
    } catch (e) {
      lines.push('', `**Caller checks skipped when signed out:** could not be read (${e.message}).`);
    }
  }

  if (token && ref) {
    try {
      const r = judgeOwnedDomains((await query(token, ref, OWNED_DOMAINS_SQL))?.[0], config.ownedDomains);
      lines.push('', `**Owned domains:** ${r.line}`);
      if (!r.ok) failures.push(`Owned domains: ${r.line.replace(/^❌ /, '')}. trashdrop.app is someone else's (TD58): move links and emails to trashdrops.com.`);
    } catch (e) {
      lines.push('', `**Owned domains:** could not be read (${e.message}).`);
    }
  }

  if (token && ref) {
    try {
      const r = judgeMoneyWrites((await query(token, ref, moneyWritesSql(config.moneyWrites.reviewed)))?.[0]?.unreviewed, config.moneyWrites);
      lines.push('', `**Money and points writes:** ${r.line}`);
      if (!r.ok) failures.push(`Money and points writes: ${r.line.replace(/^❌ /, '')}. List them privately (engineering/runbooks/database-function-review.md), check that the server sets the amounts (secure-development principle 1), then add them to moneyWrites.reviewed with the owner's approval.`);
    } catch (e) {
      lines.push('', `**Money and points writes:** could not be read (${e.message}).`);
    }
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
  assert(judgePersonalExposure(0, { maxExposed: 0 }).ok && !judgePersonalExposure(1, { maxExposed: 0 }).ok && !judgePersonalExposure(undefined, { maxExposed: 0 }).ok, 'judgePersonalExposure');
  assert(/^select count\(\*\)::int as exposed\s*$/.test(PERSONAL_EXPOSURE_SQL.split('from')[0]), 'personal exposure check selects a count, not names');
  assert(Number.isInteger(config.personalExposure?.maxExposed), 'personalExposure config');
  const ucfg = { maxWriters: 0, maxPersonalReads: 2 };
  assert(judgeUnchecked({ writers: 0, personal_reads: 2 }, ucfg).ok && !judgeUnchecked({ writers: 1, personal_reads: 0 }, ucfg).ok
    && !judgeUnchecked({ writers: 0, personal_reads: 3 }, ucfg).ok && !judgeUnchecked(undefined, ucfg).ok, 'judgeUnchecked');
  assert(/^select\s+count\(\*\)/.test(UNCHECKED_FUNCTIONS_SQL) && !/proname\s*(,|as)/.test(UNCHECKED_FUNCTIONS_SQL.split('from pg_proc')[0]), 'unchecked-function check selects counts, not names');
  assert(Number.isInteger(config.uncheckedFunctions?.maxWriters) && Number.isInteger(config.uncheckedFunctions?.maxPersonalReads), 'uncheckedFunctions config');
  const exp = { 'function a': 'h1', 'view b': 'h2' };
  assert(judgeProtected([{ rule: 'x', object: 'function a', hash: 'h1' }, { rule: 'x', object: 'view b', hash: 'h2' }], exp).length === 0, 'judgeProtected: unchanged');
  const pr = judgeProtected([{ rule: 'x', object: 'function a', hash: 'zz' }, { rule: 'x', object: 'view b', hash: null }, { rule: 'x', object: 'trigger c', hash: 'h3' }], exp);
  assert(pr.length === 3 && /changed/.test(pr[0]) && /missing/.test(pr[1]) && /no recorded/.test(pr[2]), 'judgeProtected: changed, missing, unrecorded');
  assert(judgeProtected(undefined, exp).length === 2, 'judgeProtected: nothing read means everything missing');
  const recorded = Object.keys(config.protectedDefinitions?.objects || {});
  const listed = [...PROTECTED_FUNCTIONS.map(([, n]) => `function ${n}`), ...PROTECTED_TRIGGERS.map(([, t, n]) => `trigger ${t}.${n}`),
    'view user_stats_dashboard', 'policies promotional_usage', 'policies rewards_redemption'];
  assert(listed.length === recorded.length && listed.every((o) => recorded.includes(o)), 'every protected object has a recorded fingerprint');
  assert(Object.values(config.protectedDefinitions.objects).every((h) => /^[0-9a-f]{32}$/.test(h)), 'fingerprints are md5');
  const accessListed = [...ACCESS_FUNCTIONS.map((n) => `function ${n}`), ...ACCESS_TABLES.map((t) => `policies ${t}`)];
  const accessRecorded = Object.keys(config.accessDefinitions?.objects || {});
  assert(accessListed.length === accessRecorded.length && accessListed.every((o) => accessRecorded.includes(o)), 'every access-control object has a recorded fingerprint');
  assert(Object.values(config.accessDefinitions.objects).every((h) => /^md5:[0-9a-f]{32}$/.test(h)), 'access fingerprints are md5:<hash> (plain hashes next to names like my_access trip the secret scan)');
  assert(judgeProtected([{ rule: 'access', object: 'function a', hash: 'h1' }], { 'function a': 'md5:h1' }).length === 0, 'judgeProtected: md5: prefix');
  assert(/^select 'access'/.test(ACCESS_DEFINITIONS_SQL) && !ACCESS_DEFINITIONS_SQL.includes('${'), 'access SQL is built');
  const cap = { revisitRows: 100000, revisitMb: 2048 };
  assert(!judgeCapacity({ largest_table: 'logs', largest_rows: 1081, db_bytes: 50 * 1048576 }, cap).due, 'judgeCapacity: small');
  assert(judgeCapacity({ largest_table: 'logs', largest_rows: 100000, db_bytes: 1 }, cap).due && judgeCapacity({ largest_table: 'x', largest_rows: 1, db_bytes: 2048 * 1048576 }, cap).due, 'judgeCapacity: thresholds');
  assert(!judgeCapacity(undefined, cap).due && /could not/.test(judgeCapacity(undefined, cap).line), 'judgeCapacity: nothing read');
  assert(Number.isInteger(config.capacity?.revisitRows) && Number.isInteger(config.capacity?.revisitMb), 'capacity config');
  const lcfg = { repos: [{}, {}], maxMissing: 0 };
  const lfiles = ['20261112154512_td53_confirmed_only_cashout.sql', '20261117_admin_confirm_bin_payments.sql'];
  assert(judgeLedger([{ version: '20261112154512', name: 'td53_confirmed_only_cashout' }, { version: '20261112160018', name: 'admin_confirm_bin_payments' }], lfiles, lcfg).ok, 'judgeLedger: by version and by name');
  const lmiss = judgeLedger([{ version: '20261201000000', name: 'something_new' }], lfiles, lcfg);
  assert(!lmiss.ok && lmiss.missing[0] === '20261201000000 something_new', 'judgeLedger: missing file');
  assert(!judgeLedger(undefined, lfiles, lcfg).ok && !judgeLedger([], [], lcfg).ok, 'judgeLedger: nothing read');
  assert(Array.isArray(config.migrationLedger?.repos) && config.migrationLedger.repos.length === 3 && Number.isInteger(config.migrationLedger.maxMissing), 'migrationLedger config');
  assert(judgeSkippedCheck(0, { max: 0 }).ok && !judgeSkippedCheck(1, { max: 0 }).ok && !judgeSkippedCheck(undefined, { max: 0 }).ok, 'judgeSkippedCheck');
  assert(/^select count\(\*\)::int as skipped /.test(SKIPPED_CHECK_SQL) && /prosecdef/.test(SKIPPED_CHECK_SQL) && /'anon'/.test(SKIPPED_CHECK_SQL), 'skipped-check SQL counts, not names');
  assert(Number.isInteger(config.skippedCallerCheck?.max), 'skippedCallerCheck config');
  assert(judgeOwnedDomains({ bins: 0, accounts: 0, functions: 0 }, { max: 0 }).ok, 'owned domains: clean');
  assert(!judgeOwnedDomains({ bins: 28, accounts: 1, functions: 4 }, { max: 0 }).ok, 'owned domains: 2026-11-12 state fails');
  assert(!judgeOwnedDomains(undefined, { max: 0 }).ok && !judgeOwnedDomains({ bins: 0 }, { max: 0 }).ok, 'owned domains: unreadable fails');
  assert(/count\(\*\)::int/.test(OWNED_DOMAINS_SQL) && !/select email|select qr_code_url/i.test(OWNED_DOMAINS_SQL), 'owned-domains SQL counts, not names');
  assert(Number.isInteger(config.ownedDomains?.max), 'ownedDomains config');
  assert(judgeMoneyWrites(0, { reviewed: ['a'] }).ok && !judgeMoneyWrites(1, { reviewed: [] }).ok && !judgeMoneyWrites(undefined, { reviewed: [] }).ok, 'judgeMoneyWrites');
  assert(/^with money_tables as/.test(moneyWritesSql(['x'])) && /count\(\*\)::int as unreviewed/.test(moneyWritesSql(['x'])) && moneyWritesSql(["o'x"]).includes("'o''x'"), 'moneyWritesSql counts, quotes names');
  assert(Array.isArray(config.moneyWrites?.reviewed) && config.moneyWrites.reviewed.length > 0, 'moneyWrites config');
  // Public defaults (supabase-public.json): fill only what is unset, never on pull requests
  const unset = { GITHUB_EVENT_NAME: 'schedule', SUPABASE_URL: 'https://set.example' };
  const applied = applyPublicDefaults(unset);
  assert(unset.SUPABASE_URL === 'https://set.example', 'a set variable wins over the default');
  assert(applied.includes('SUPABASE_PUBLISHABLE_KEY') && /^sb_publishable_/.test(unset.SUPABASE_PUBLISHABLE_KEY), 'default publishable key filled in');
  assert(/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(applyPublicDefaults({}) && publicDefaults().SUPABASE_URL), 'default URL is a Supabase project');
  const onPullRequest = { GITHUB_EVENT_NAME: 'pull_request' };
  assert(applyPublicDefaults(onPullRequest).length === 0 && !onPullRequest.SUPABASE_URL, 'no production defaults on pull requests');

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
