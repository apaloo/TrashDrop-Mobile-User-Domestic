#!/usr/bin/env node
/*
 * Security watch: checks production the way an outsider would.
 *   1. Probes: requests with only the public app key must be refused or see
 *      no rows (see security-watch-config.json). A control probe must see data.
 *   2. Advisors (when SUPABASE_ACCESS_TOKEN is set): no new ERROR-level
 *      findings, and warning counts no higher than their ceilings.
 * Exits 1 on any failure. Prints a Markdown summary (GITHUB_STEP_SUMMARY)
 * and writes security-watch-result.json for the workflow's issue step.
 *
 * Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (public), and optionally
 *      SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF for the advisors.
 */
import fs from 'node:fs';
import path from 'node:path';

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

  const summary = lines.join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  fs.writeFileSync('security-watch-result.json', JSON.stringify({ failures }, null, 2));
  process.exit(failures.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main();
