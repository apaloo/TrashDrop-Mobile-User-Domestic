#!/usr/bin/env node
/*
 * Operations watch: work that has waited too long. On 2026-11-12 a pickup had
 * sat at "arrived" for three weeks, digital bins had waited for a collector
 * since May and 174 dumping reports had never been verified, and nothing told
 * anyone. Every Monday this counts, per queue in operations-watch-config.json,
 * the items waiting longer than the queue's limit: since they were created
 * (nobody picked them up) or since their last change (work that stopped).
 *
 * Counts and ages only: no ids, names or places, because the repository is
 * public. Staff find the items on the admin site.
 *
 * It reports; it does not fail the build: a backlog is an operations matter,
 * and a check that is always red gets ignored. The workflow keeps one issue
 * up to date (with the change since the last run) and closes it when every
 * queue is within its limit.
 *
 * Env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF (default in supabase-public.json).
 *   node engineering/automation/operations-watch.mjs --self-test   logic only, no network
 * Exits 2 when it can't run, else 0. Writes operations-watch-result.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { applyPublicDefaults } from './supabase-public.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const config = JSON.parse(fs.readFileSync(path.join(here, 'operations-watch-config.json'), 'utf8'));

// Checks the config before anything goes into SQL: known tables and statuses only.
export function validate(cfg) {
  const problems = [];
  const ids = new Set();
  for (const q of cfg.queues) {
    if (!/^[a-z-]+$/.test(q.id) || ids.has(q.id)) problems.push(`${q.id}: id must be unique, lowercase and dashes`);
    ids.add(q.id);
    const allowed = cfg.allowed[q.table];
    if (!allowed) problems.push(`${q.id}: unknown table ${q.table}`);
    else for (const s of q.statuses) if (!allowed.includes(s)) problems.push(`${q.id}: ${s} is not a status of ${q.table}`);
    if (!(Number.isInteger(q.olderThanHours) && q.olderThanHours > 0)) problems.push(`${q.id}: olderThanHours must be a positive whole number`);
    if (!q.what) problems.push(`${q.id}: needs a description`);
    if (!['created', 'lastChange'].includes(q.ageFrom)) problems.push(`${q.id}: ageFrom must be created or lastChange`);
  }
  return problems;
}

export function buildSql(cfg) {
  const parts = cfg.queues.map((q) => {
    const statuses = q.statuses.map((s) => `'${s}'`).join(', ');
    const since = q.ageFrom === 'created' ? 'created_at' : 'coalesce(updated_at, created_at)';
    const late = `${since} < now() - interval '${q.olderThanHours} hours'`;
    return `select '${q.id}' as id,
  count(*) filter (where ${late}) as waiting,
  count(*) as in_status,
  floor(extract(epoch from now() - min(${since}) filter (where ${late})) / 86400)::int as oldest_days
from public.${q.table} where status in (${statuses})`;
  });
  return parts.join('\nunion all\n');
}

// rows + previous counts -> report lines and the counts to remember
export function report(rows, cfg, previous = {}) {
  const byId = Object.fromEntries((rows ?? []).map((r) => [r.id, r]));
  const counts = {};
  const lines = ['| Queue | Limit | Waiting too long | Oldest | Since last week |', '|---|---|---|---|---|'];
  let total = 0;
  for (const q of cfg.queues) {
    const r = byId[q.id] ?? {};
    const waiting = Number(r.waiting ?? 0);
    counts[q.id] = waiting;
    total += waiting;
    const limit = q.olderThanHours % 24 === 0 ? `${q.olderThanHours / 24} day(s)` : `${q.olderThanHours} h`;
    const before = previous[q.id];
    const change = before === undefined ? '–' : waiting === before ? 'same' : waiting > before ? `▲ +${waiting - before}` : `▼ ${waiting - before}`;
    const oldest = waiting ? `${r.oldest_days ?? '?'} days` : '–';
    lines.push(`| ${waiting ? '⚠️ ' : ''}${q.what} | ${limit} | ${waiting} | ${oldest} | ${change} |`);
  }
  return { total, counts, table: lines.join('\n') };
}

async function query(token, ref, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: true }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  applyPublicDefaults(); // public values from supabase-public.json when the variables are unset
  const write = (o) => fs.writeFileSync('operations-watch-result.json', JSON.stringify(o, null, 2));
  const problems = validate(config);
  if (problems.length) { write({ error: problems.join('; ') }); console.error(problems.join('\n')); process.exit(2); }
  const token = process.env.SUPABASE_ACCESS_TOKEN; const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) {
    const msg = 'Operations watch not configured: set the SUPABASE_ACCESS_TOKEN secret (setup step 07b).';
    if (process.env.GITHUB_EVENT_NAME === 'pull_request') { console.log(msg + ' Skipped on this pull request.'); process.exit(0); }
    write({ error: msg }); console.error(msg); process.exit(2);
  }
  let rows;
  try { rows = await query(token, ref, buildSql(config)); } catch (e) {
    const msg = `Operations watch could not read the database (${e.message}).`;
    write({ error: msg }); console.error(msg); process.exit(2);
  }
  let previous = {};
  try { previous = JSON.parse(process.env.PREVIOUS_COUNTS || '{}'); } catch { previous = {}; }
  const { total, counts, table } = report(rows, config, previous);
  const summary = [`### Operations watch: work waiting too long`, '', total ? `⚠️ **${total} item(s)** past their limit.` : '✅ Every queue is within its limit.', '', table].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  write({ total, counts, table });
  process.exit(0);
}

function selfTest() {
  const assert = (ok, what) => { if (!ok) { console.error(`self-test failed: ${what}`); process.exit(1); } };
  assert(validate(config).length === 0, `config valid: ${validate(config).join('; ')}`);
  const bad = { allowed: { t: ['a'] }, queues: [{ id: 'x', what: 'x', table: 't', statuses: ["a'; drop table t; --"], ageFrom: 'created', olderThanHours: 1 }, { id: 'y', what: 'y', table: 'evil;', statuses: ['a'], ageFrom: 'whenever', olderThanHours: 0 }] };
  const p = validate(bad);
  assert(p.length === 4, `bad config refused (${p.length}: ${p.join('; ')})`);
  const sql = buildSql(config);
  const one = (q) => buildSql({ queues: [q] });
  assert(one({ id: 'a', table: 't', statuses: ['a'], ageFrom: 'created', olderThanHours: 1 }).includes('min(created_at)'), 'created measures from created_at');
  assert(one({ id: 'a', table: 't', statuses: ['a'], ageFrom: 'lastChange', olderThanHours: 1 }).includes('min(coalesce(updated_at, created_at))'), 'lastChange measures from the last change');
  assert(config.queues.every((q) => sql.includes(`'${q.id}' as id`) && sql.includes(`public.${q.table}`)), 'one select per queue');
  assert(!/;/.test(sql), 'a single statement');
  const cfg = { queues: [{ id: 'a', what: 'A', olderThanHours: 48 }, { id: 'b', what: 'B', olderThanHours: 30 }, { id: 'c', what: 'C', olderThanHours: 24 }], allowed: {} };
  const r = report([{ id: 'a', waiting: 6, oldest_days: 190 }, { id: 'b', waiting: 0 }, { id: 'c', waiting: 2, oldest_days: 3 }], cfg, { a: 4, c: 2 });
  assert(r.total === 8 && r.counts.a === 6 && r.counts.b === 0, 'totals and counts');
  assert(r.table.includes('| ⚠️ A | 2 day(s) | 6 | 190 days | ▲ +2 |'), 'growth shown');
  assert(r.table.includes('| B | 30 h | 0 | – | – |'), 'empty queue, no history');
  assert(r.table.includes('| ⚠️ C | 1 day(s) | 2 | 3 days | same |'), 'unchanged shown');
  assert(report([{ id: 'a', waiting: 1, oldest_days: 2 }], cfg, { a: 3 }).table.includes('▼ -2'), 'shrinking shown');
  console.log(`self-test passed (${config.queues.length} queues)`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  if (process.argv.includes('--self-test')) selfTest(); else main();
}
