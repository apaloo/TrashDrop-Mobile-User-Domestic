#!/usr/bin/env node
/*
 * Full-history secret scan of the three TrashDrop repositories.
 *
 * The pull-request scan (security.yml) only sees new commits; this one reads
 * every commit ever pushed, so a secret that slipped in before the checks
 * existed, or by a direct push, is still found.
 *
 * Each finding is identified by a one-way hash of where it is (repository,
 * commit, file, rule, line). Reviewed findings are listed by hash only in
 * history-secret-scan-baseline.json with what was decided, so this public
 * repository never says where an old secret sits. The scan fails on any
 * finding that is not in the list, and reports findings still waiting to be
 * revoked. Details of a finding are looked up privately (runbook:
 * engineering/runbooks/secret-in-git-history.md).
 *
 * Usage:
 *   node history-secret-scan.mjs <repo>=<path to a full clone> ...   scan
 *   node history-secret-scan.mjs --hash <repo> <gitleaks-report.json>  hashes for review
 *   node history-secret-scan.mjs --self-test
 * Needs gitleaks on PATH (the workflow installs a checksum-verified copy).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(here, 'history-secret-scan-baseline.json');
const CONFIG = join(here, '..', '..', '.gitleaks.toml');

// What a reviewed finding was decided to be. Only 'awaiting-revocation' is
// reported as still open; the others are settled.
export const DECISIONS = {
  'awaiting-revocation': 'a real secret; the owner still has to revoke it',
  revoked: 'a real secret, revoked; it no longer works',
  'public-by-design': 'meant to be public (Supabase anon or publishable key)',
  'dev-only': 'only ever used on a developer machine (e.g. a localhost certificate)',
  'not-a-secret': 'a placeholder, test value or identifier',
};

export function findingHash(repo, f) {
  return createHash('sha256')
    .update(`${repo}:${f.Commit}:${f.File}:${f.RuleID}:${f.StartLine}`)
    .digest('hex')
    .slice(0, 24);
}

// findings: [{ repo, finding }] -> { open, unreviewed, byDecision }
export function judge(findings, reviewed) {
  const byDecision = {};
  const unreviewed = [];
  for (const { repo, finding } of findings) {
    const decision = reviewed[findingHash(repo, finding)];
    if (!decision) {
      unreviewed.push({ repo, rule: finding.RuleID });
      continue;
    }
    const key = `${repo} · ${decision}`;
    byDecision[key] = (byDecision[key] || 0) + 1;
  }
  const open = Object.entries(byDecision)
    .filter(([k]) => k.endsWith('awaiting-revocation'))
    .reduce((n, [, v]) => n + v, 0);
  return { open, unreviewed, byDecision };
}

function scanRepo(path) {
  const dir = mkdtempSync(join(tmpdir(), 'history-scan-'));
  const report = join(dir, 'report.json');
  try {
    // Exit code 1 means "found something"; the report says what.
    try {
      execFileSync('gitleaks', ['git', path, '--no-banner', '--redact', '--config', CONFIG,
        '--report-format', 'json', '--report-path', report, '--exit-code', '0'], { stdio: 'pipe' });
    } catch (e) {
      throw new Error(`gitleaks failed on ${path}: ${e.stderr || e.message}`);
    }
    return JSON.parse(readFileSync(report, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(args) {
  const { reviewed } = JSON.parse(readFileSync(BASELINE, 'utf8'));
  for (const d of Object.values(reviewed)) {
    if (!DECISIONS[d]) throw new Error(`Unknown decision "${d}" in ${BASELINE}`);
  }
  const findings = [];
  for (const arg of args) {
    const [repo, path] = arg.split('=');
    for (const finding of scanRepo(path)) findings.push({ repo, finding });
  }
  const { open, unreviewed, byDecision } = judge(findings, reviewed);
  const lines = ['### Secret scan of full git history', '', '| Repository · decision | Findings |', '|---|---|'];
  for (const [k, n] of Object.entries(byDecision).sort()) lines.push(`| ${k} | ${n} |`);
  lines.push('');
  if (open) lines.push(`⚠️ ${open} reviewed secret(s) still waiting to be revoked by the owner (details in the private incident file).`);
  if (unreviewed.length) {
    const summary = unreviewed.map((u) => `${u.repo} (${u.rule})`).join(', ');
    lines.push(`❌ ${unreviewed.length} new finding(s) in git history: ${summary}. Look them up privately and decide (engineering/runbooks/secret-in-git-history.md); treat each as a live secret until shown otherwise.`);
  } else {
    lines.push('✅ No new secrets in the history of any repository.');
  }
  console.log(lines.join('\n'));
  return unreviewed.length ? 1 : 0;
}

function hashMode(repo, reportPath) {
  for (const f of JSON.parse(readFileSync(reportPath, 'utf8'))) {
    console.log(`${findingHash(repo, f)}\t${f.RuleID}\t${f.File}\t${f.Commit.slice(0, 7)}`);
  }
}

function selfTest() {
  const assert = (c, m) => { if (!c) throw new Error(`self-test: ${m}`); };
  const f = { Commit: 'abc', File: 'a/.env', RuleID: 'jwt', StartLine: 3 };
  const g = { ...f, StartLine: 4 };
  const h = findingHash('household', f);
  assert(h.length === 24 && h === findingHash('household', { ...f }), 'stable hash');
  assert(h !== findingHash('admin', f) && h !== findingHash('household', g), 'hash depends on location');
  const r = judge([{ repo: 'household', finding: f }, { repo: 'household', finding: g }], { [h]: 'awaiting-revocation' });
  assert(r.open === 1 && r.unreviewed.length === 1 && r.unreviewed[0].rule === 'jwt', 'judge');
  assert(judge([{ repo: 'household', finding: f }], { [h]: 'revoked' }).open === 0, 'revoked is settled');
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  assert(Object.values(base.reviewed).every((d) => DECISIONS[d]), 'baseline decisions are known');
  assert(Object.keys(base.reviewed).every((k) => /^[0-9a-f]{24}$/.test(k)), 'baseline holds hashes only');
  console.log('history-secret-scan self-test passed');
}

const args = process.argv.slice(2);
if (args[0] === '--self-test') selfTest();
else if (args[0] === '--hash') hashMode(args[1], args[2]);
else process.exit(main(args));
