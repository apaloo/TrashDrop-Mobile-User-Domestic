#!/usr/bin/env node
// Test coverage summary and floors for CI.
//
// Reads coverage/coverage-summary.json (Jest's json-summary reporter) and
// writes a table to the job summary: the whole app, then each file listed in
// scripts/ci/critical-files.txt (the code behind the critical workflows and
// the protected money and points rules). The monthly report takes its
// coverage figure from here (QA policy, "Measures").
//
// Floors (2026-11-13): scripts/ci/coverage-floors.json holds the line
// coverage the whole app and each critical file must keep. A pull request
// that drops one more than TOLERANCE points below its floor fails; one that
// rises RAISE_HINT points above it gets a notice to raise the floor in the
// same pull request, so the floors only move up. A critical file without a
// floor, or a floor for a file no longer listed, fails too.
//
//   node scripts/ci/coverage-summary.mjs              report and check floors
//   node scripts/ci/coverage-summary.mjs --self-test  check the rules
//
// The same script is used in all three TrashDrop repositories.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

export const TOLERANCE = 0.5;
export const RAISE_HINT = 2;

const pct = (m) => (m && m.total ? `${m.pct}%` : 'n/a');

/** { failures: [string], raise: [string] } for line coverage against the floors */
export function checkFloors({ total, byFile, critical, floors }) {
  const failures = [];
  const raise = [];
  const judge = (label, actual, floor) => {
    if (floor === undefined) return;
    if (actual === undefined) { failures.push(`${label}: no coverage (floor ${floor}%); is it still loaded by a test?`); return; }
    if (actual < floor - TOLERANCE) failures.push(`${label}: ${actual}% of lines, below its floor of ${floor}%`);
    else if (actual >= floor + RAISE_HINT) raise.push(`${label}: ${actual}%, raise its floor from ${floor}% to ${Math.floor(actual * 10) / 10}%`);
  };
  judge('whole app', total, floors.total);
  const fileFloors = floors.files || {};
  for (const f of critical) {
    if (!(f in fileFloors)) failures.push(`${f}: a critical file with no floor in coverage-floors.json`);
    else judge(f, byFile.get(f)?.lines?.total ? byFile.get(f).lines.pct : undefined, fileFloors[f]);
  }
  for (const f of Object.keys(fileFloors)) {
    if (!critical.includes(f)) failures.push(`${f}: has a floor but is not in critical-files.txt (remove one or add the other)`);
  }
  return { failures, raise };
}

function main() {
  const root = process.cwd();
  const summaryFile = path.join(root, 'coverage', 'coverage-summary.json');
  const listFile = path.join(root, 'scripts', 'ci', 'critical-files.txt');
  const floorsFile = path.join(root, 'scripts', 'ci', 'coverage-floors.json');
  if (!fs.existsSync(summaryFile)) {
    console.log('No coverage summary found (did the tests run?); skipped.');
    return 0;
  }
  const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
  const byFile = new Map(
    Object.entries(summary)
      .filter(([k]) => k !== 'total')
      .map(([k, v]) => [path.relative(root, k).split(path.sep).join('/'), v]),
  );
  const critical = fs.existsSync(listFile)
    ? fs.readFileSync(listFile, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    : [];
  const floors = fs.existsSync(floorsFile) ? JSON.parse(fs.readFileSync(floorsFile, 'utf8')) : null;

  const t = summary.total;
  const lines = [
    '### Test coverage',
    '',
    `Whole app: **${pct(t.lines)} of lines**, ${pct(t.branches)} of branches, ${pct(t.functions)} of functions (${byFile.size} files)${floors?.total !== undefined ? `; floor ${floors.total}%` : ''}.`,
    '',
  ];
  if (critical.length) {
    lines.push('| Critical file | Lines | Floor | Branches |', '|---|---|---|---|');
    for (const f of critical) {
      const m = byFile.get(f);
      const floor = floors?.files?.[f];
      lines.push(m ? `| \`${f}\` | ${pct(m.lines)} | ${floor !== undefined ? floor + '%' : '-'} | ${pct(m.branches)} |` : `| \`${f}\` | not loaded by any test | ${floor ?? '-'} | |`);
    }
  }
  let failed = false;
  if (floors) {
    const { failures, raise } = checkFloors({ total: t.lines?.pct, byFile, critical, floors });
    if (failures.length) {
      failed = true;
      lines.push('', `**Coverage floors: ❌ ${failures.length} problem(s)** (scripts/ci/coverage-floors.json; a floor may only go up)`);
      failures.forEach((f) => lines.push(`- ${f}`));
    } else {
      lines.push('', '**Coverage floors: ✅ held.**');
    }
    if (raise.length) {
      lines.push('', 'Coverage rose; raise these floors in this pull request:');
      raise.forEach((r) => lines.push(`- ${r}`));
    }
  } else {
    lines.push('', 'Report only (no scripts/ci/coverage-floors.json).');
  }
  const md = lines.join('\n') + '\n';
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  return failed ? 1 : 0;
}

function selfTest() {
  const file = (p) => ({ lines: { total: 10, pct: p } });
  const byFile = new Map([['a.js', file(80)], ['b.js', file(40)], ['c.js', file(70.4)]]);
  const run = (floors, critical = ['a.js', 'b.js', 'c.js']) => checkFloors({ total: 38, byFile, critical, floors });
  let r = run({ total: 38, files: { 'a.js': 80, 'b.js': 40, 'c.js': 70.6 } });
  assert.deepStrictEqual(r, { failures: [], raise: [] }); // within the tolerance
  r = run({ total: 39, files: { 'a.js': 80, 'b.js': 41, 'c.js': 70 } });
  assert.deepStrictEqual(r.failures, ['whole app: 38% of lines, below its floor of 39%', 'b.js: 40% of lines, below its floor of 41%']);
  r = run({ total: 35, files: { 'a.js': 70, 'b.js': 40, 'c.js': 70 } });
  assert.deepStrictEqual(r.failures, []);
  assert.deepStrictEqual(r.raise, ['whole app: 38%, raise its floor from 35% to 38%', 'a.js: 80%, raise its floor from 70% to 80%']);
  r = run({ total: 38, files: { 'a.js': 80, 'b.js': 40, 'gone.js': 50 } });
  assert.deepStrictEqual(r.failures, ['c.js: a critical file with no floor in coverage-floors.json', 'gone.js: has a floor but is not in critical-files.txt (remove one or add the other)']);
  r = checkFloors({ total: 38, byFile, critical: ['x.js'], floors: { files: { 'x.js': 10 } } });
  assert.match(r.failures[0], /x.js: no coverage/);
  console.log('coverage-summary self-test passed');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    let code = 0;
    try {
      code = main();
    } catch (e) {
      console.log('Coverage summary could not be read:', e.message);
      code = 1;
    }
    process.exit(code);
  }
}
