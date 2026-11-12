#!/usr/bin/env node
/*
 * Production smoke check: is each live site up, and did the last deploy
 * leave its key pieces working? Every check is a plain GET with no sign-in
 * (production-smoke-config.json). A failed check is retried once after 20
 * seconds, so a blip doesn't raise an incident.
 *
 * Exits 1 when a check fails. Prints a Markdown table (GITHUB_STEP_SUMMARY)
 * and writes production-smoke-result.json for the workflow's issue step.
 *
 *   node engineering/automation/production-smoke.mjs              live checks
 *   node engineering/automation/production-smoke.mjs --self-test  logic only, no network
 *
 * Env (optional, for S01): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (public by
 * design; the same repository variables as the security watch).
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { applyPublicDefaults } from './supabase-public.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const config = JSON.parse(fs.readFileSync(path.join(here, 'production-smoke-config.json'), 'utf8'));
const TIMEOUT_MS = 15000;
const RETRY_AFTER_MS = Number(process.env.SMOKE_RETRY_AFTER_MS ?? 20000);

// What went wrong with one response, or null when it is as expected
export function judge(check, res) {
  if (res.error) return res.error;
  if (res.status !== check.status) return `HTTP ${res.status}, expected ${check.status}`;
  if (check.contains && !String(res.body ?? '').includes(check.contains)) return `response does not contain ${JSON.stringify(check.contains)}`;
  if (check.header && !res.headers?.[check.header.toLowerCase()]) return `missing header ${check.header}`;
  return null;
}

// Base URL and headers for a check; null when it needs settings that aren't there
export function target(check, env, sites = config.sites) {
  if (check.site === 'supabase') {
    if (!(check.needs ?? []).every((n) => env[n])) return null;
    return { url: env.SUPABASE_URL.replace(/\/$/, '') + check.path, headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } };
  }
  const base = sites[check.site];
  if (!base) throw new Error(`${check.id}: unknown site ${check.site}`);
  return { url: base.replace(/\/$/, '') + check.path, headers: {} };
}

async function request({ url, headers }) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'trashdrop-production-smoke', ...headers },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.text();
    return { status: res.status, body, headers: Object.fromEntries(res.headers), ms: Date.now() - started };
  } catch (e) {
    const why = e.name === 'TimeoutError' ? `no answer within ${TIMEOUT_MS / 1000} s` : `request failed: ${e.cause?.code || e.message}`;
    return { error: why, ms: Date.now() - started };
  }
}

export async function runChecks(checks, env, fetchOne = request, wait = (ms) => new Promise((r) => setTimeout(r, ms))) {
  const results = [];
  for (const check of checks) {
    const t = target(check, env);
    if (!t) { results.push({ check, skipped: `not configured (${check.needs.join(', ')})` }); continue; }
    let res = await fetchOne(t);
    let problem = judge(check, res);
    if (problem) {
      await wait(RETRY_AFTER_MS);
      res = await fetchOne(t);
      problem = judge(check, res);
    }
    results.push({ check, url: t.url, problem, ms: res.ms });
  }
  return results;
}

function report(results) {
  const lines = ['### Production smoke check', '', '| Check | What | Result |', '|---|---|---|'];
  for (const r of results) {
    const result = r.skipped ? `skipped: ${r.skipped}` : r.problem ? `**FAIL**: ${r.problem}` : `ok (${r.ms} ms)`;
    lines.push(`| ${r.check.id} | ${r.check.what} | ${result} |`);
  }
  const failures = results.filter((r) => r.problem).map((r) => `${r.check.id} ${r.check.what}: ${r.problem} (${r.url})`);
  return { markdown: lines.join('\n') + '\n', failures };
}

async function selfTest() {
  const ok = { status: 200, body: '<title>TrashDrop</title>', headers: { 'strict-transport-security': 'max-age=1' } };
  const home = { id: 'T1', site: 'admin', path: '/', status: 200, contains: '<title>TrashDrop', header: 'strict-transport-security' };
  assert.strictEqual(judge(home, ok), null);
  assert.match(judge(home, { ...ok, status: 503 }), /HTTP 503/);
  assert.match(judge(home, { ...ok, body: 'Site not found' }), /does not contain/);
  assert.match(judge(home, { ...ok, headers: {} }), /missing header/);
  assert.match(judge(home, { error: 'no answer within 15 s' }), /no answer/);

  const supa = config.checks.find((c) => c.site === 'supabase');
  assert.strictEqual(target(supa, {}), null, 'skipped without settings');
  assert.deepStrictEqual(target(supa, { SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_PUBLISHABLE_KEY: 'k' }),
    { url: 'https://x.supabase.co/auth/v1/health', headers: { apikey: 'k' } });

  // A blip is retried once; a second failure is reported
  let calls = 0;
  const flaky = async () => (++calls === 1 ? { status: 502, body: '' } : ok);
  let [r] = await runChecks([home], {}, flaky, async () => {});
  assert.strictEqual(r.problem, null); assert.strictEqual(calls, 2);
  [r] = await runChecks([home], {}, async () => ({ status: 502, body: '' }), async () => {});
  assert.match(r.problem, /HTTP 502/);

  // Every configured check is well formed
  for (const c of config.checks) {
    assert.ok(c.id && c.what && c.path.startsWith('/') && Number.isInteger(c.status), `${c.id} is incomplete`);
    if (c.site !== 'supabase') assert.ok(/^https:\/\//.test(config.sites[c.site]), `${c.id}: site ${c.site} needs an https URL`);
  }
  assert.strictEqual(new Set(config.checks.map((c) => c.id)).size, config.checks.length, 'check ids are unique');
  console.log(`self-test passed (${config.checks.length} checks configured)`);
}

async function main() {
  applyPublicDefaults(); // public values from supabase-public.json when the variables are unset
  if (process.argv.includes('--self-test')) return selfTest();
  const results = await runChecks(config.checks, process.env);
  const { markdown, failures } = report(results);
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  fs.writeFileSync('production-smoke-result.json', JSON.stringify({ failures }, null, 2));
  if (failures.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(2); });
}
