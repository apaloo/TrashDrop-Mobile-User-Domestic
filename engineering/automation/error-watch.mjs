#!/usr/bin/env node
/*
 * Error watch: database errors in production over the last 24 hours,
 * grouped by type. Every bug fixed on 2026-11-12 (collector location,
 * dashboard live updates, expired-assignment release) showed up here first,
 * hundreds or thousands of times, and nothing flagged it.
 *
 * A type is flagged when it appears at least minCount times (higher limits
 * for codes ordinary traffic produces) and isn't a known, accepted one
 * still within its date and limit. Messages are normalised (quoted values,
 * ids and numbers removed) and shortened before they are printed: the
 * repository is public.
 *
 * Env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF.
 *   node engineering/automation/error-watch.mjs --self-test   logic only, no network
 * Exits 1 when something is flagged, 2 when it can't run. Writes
 * error-watch-result.json for the workflow's issue step.
 */
import fs from 'node:fs';
import path from 'node:path';
import { queryLogs } from './supabase-logs.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const config = JSON.parse(fs.readFileSync(path.join(here, 'error-watch-config.json'), 'utf8'));

// The same normalisation the SQL applies, for messages checked locally
export function normalise(message) {
  return String(message)
    .replace(/"[^"]*"/g, '"…"')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '<id>')
    .replace(/[0-9]+/g, 'N')
    .slice(0, 160);
}

export const ERRORS_SQL = `select
  substring(replaceRegexpAll(replaceRegexpAll(replaceRegexpAll(event_message, '"[^"]*"', '"…"'), '[0-9a-f]{8}-[0-9a-f-]{27}', '<id>'), '[0-9]+', 'N'), 1, 160) as signature,
  log_attributes['parsed.sql_state_code'] as code,
  count() as n,
  max(timestamp) as last_seen
from logs
where source = 'postgres_logs'
  and log_attributes['parsed.error_severity'] in ('ERROR', 'FATAL', 'PANIC')
group by signature, code
order by n desc
limit 200`;

// rows -> { flagged, known, ignored } with counts
export function judgeErrors(rows, cfg, today = new Date().toISOString().slice(0, 10)) {
  const flagged = []; const known = []; let ignored = 0;
  for (const r of rows ?? []) {
    const signature = String(r.signature ?? '');
    const code = String(r.code ?? '');
    const n = Number(r.n);
    if (cfg.ignorePrefixes.some((p) => signature.startsWith(p))) { ignored += n; continue; }
    const limit = cfg.codeLimits[code] ?? cfg.minCount;
    if (n < limit) continue;
    const k = cfg.known.find((x) => x.match === signature && (!x.code || x.code === code));
    const item = { signature, code, n, last: String(r.last_seen ?? '') };
    if (k && today <= k.until && n <= k.max) { known.push({ ...item, ref: k.ref }); continue; }
    flagged.push({ ...item, reason: !k ? 'new' : today > k.until ? `${k.ref} accepted until ${k.until}` : `${k.ref} above its daily max of ${k.max}` });
  }
  return { flagged, known, ignored };
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN; const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) {
    const msg = 'Error watch not configured: set the SUPABASE_ACCESS_TOKEN secret and the SUPABASE_PROJECT_REF variable (setup step 07b).';
    if (process.env.GITHUB_EVENT_NAME === 'pull_request') { console.log(msg + ' Skipped on this pull request.'); process.exit(0); }
    fs.writeFileSync('error-watch-result.json', JSON.stringify({ failures: [msg] }, null, 2));
    console.error(msg); process.exit(2);
  }
  const r = await queryLogs(token, ref, ERRORS_SQL, config.hours);
  if (r.error) {
    const msg = `Error watch could not read the logs (${r.error}).`;
    fs.writeFileSync('error-watch-result.json', JSON.stringify({ failures: [msg] }, null, 2));
    console.error(msg); process.exit(2);
  }
  const { flagged, known, ignored } = judgeErrors(r.rows, config);
  const row = (x, extra) => `| \`${x.code}\` | ${x.signature.replace(/\|/g, '\\|')} | ${x.n} | ${extra} |`;
  const lines = ['### Error watch (last 24 hours)', ''];
  if (flagged.length) {
    lines.push(`❌ **${flagged.length} error type(s) to look at**`, '', '| Code | Error | Count | Why flagged |', '|---|---|---|---|');
    flagged.forEach((x) => lines.push(row(x, x.reason)));
  } else {
    lines.push('✅ No new or growing error types.');
  }
  if (known.length) {
    lines.push('', 'Known and accepted:', '', '| Code | Error | Count | Register |', '|---|---|---|---|');
    known.forEach((x) => lines.push(row(x, x.ref)));
  }
  if (ignored) lines.push('', `${ignored} message(s) from rolled-back tests not counted.`);
  const summary = lines.join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  const failures = flagged.map((x) => `\`${x.code}\` ${x.signature}: ${x.n} in 24 h (${x.reason})`);
  fs.writeFileSync('error-watch-result.json', JSON.stringify({ failures }, null, 2));
  process.exit(failures.length ? 1 : 0);
}

function selfTest() {
  const assert = (ok, what) => { if (!ok) { console.error(`self-test failed: ${what}`); process.exit(1); } };
  assert(normalise('column "current_latitude" is of type numeric') === 'column "…" is of type numeric', 'normalise quotes');
  assert(normalise('id 33333333-3333-4333-8333-333333333333 row 42') === 'id <id> row N', 'normalise ids and numbers');
  const cfg = { minCount: 5, codeLimits: { 42501: 100 }, ignorePrefixes: ['ROLLED BACK'],
    known: [{ match: 'fk', code: '23503', ref: 'TD45', max: 100, until: '2027-01-01' }, { match: 'old', code: 'P0001', ref: 'TD43', max: 10, until: '2026-11-19' }] };
  // Shapes from production on 2026-11-11/12
  const rows = [
    { signature: 'column "…" is of type numeric but expression is of type text', code: '42804', n: 18 },
    { signature: 'permission denied for table notifications', code: '42501', n: 20 },
    { signature: 'fk', code: '23503', n: 11 },
    { signature: 'old', code: 'P0001', n: 3063 },
    { signature: 'ROLLED BACK. other collector: refused', code: 'P0001', n: 7 },
    { signature: 'rare', code: '42703', n: 4 },
  ];
  const r = judgeErrors(rows, cfg, '2026-11-12');
  assert(r.flagged.length === 2 && r.flagged[0].code === '42804' && r.flagged[0].reason === 'new', 'new error type is flagged');
  assert(r.flagged[1].reason === 'TD43 above its daily max of 10', 'known type above its max is flagged');
  assert(r.known.length === 1 && r.known[0].ref === 'TD45', 'known type within its max is accepted');
  assert(r.ignored === 7, 'rolled-back tests are not counted');
  assert(!r.flagged.some((x) => x.code === '42501' || x.code === '42703'), 'code limits and minCount apply');
  assert(judgeErrors([{ signature: 'fk', code: '23503', n: 11 }], cfg, '2027-01-02').flagged[0].reason === 'TD45 accepted until 2027-01-01', 'acceptance expires');
  assert(config.known.every((k) => k.ref && k.until && k.max && k.why), 'every known error has ref, until, max and why');
  assert(config.minCount >= 2 && config.hours <= 24, 'config sane');
  assert(['42703', '42883', '42804', '42725'].every((c) => config.codeLimits[c] === 1), 'schema mismatches flag from the first one');
  console.log(`self-test passed (${config.known.length} known error types)`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  if (process.argv.includes('--self-test')) selfTest(); else main();
}
