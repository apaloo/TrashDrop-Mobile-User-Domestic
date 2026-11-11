#!/usr/bin/env node
// Test coverage summary for CI (report only: never fails the build).
//
// Reads coverage/coverage-summary.json (Jest's json-summary reporter) and
// writes a table to the job summary: the whole app, then each file listed in
// scripts/ci/critical-files.txt (the code behind the critical workflows and
// the protected money rules). The monthly report takes its coverage figure
// from here (QA policy, "Measures").
//
// The same script is used in all three TrashDrop repositories.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const summaryFile = path.join(root, 'coverage', 'coverage-summary.json');
const listFile = path.join(root, 'scripts', 'ci', 'critical-files.txt');

const pct = (m) => (m && m.total ? `${m.pct}%` : 'n/a');

function main() {
  if (!fs.existsSync(summaryFile)) {
    console.log('No coverage summary found; skipped.');
    return;
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

  const t = summary.total;
  const lines = [
    '### Test coverage',
    '',
    `Whole app: **${pct(t.lines)} of lines**, ${pct(t.branches)} of branches, ${pct(t.functions)} of functions (${byFile.size} files).`,
    '',
  ];
  if (critical.length) {
    lines.push('| Critical file | Lines | Branches |', '|---|---|---|');
    for (const f of critical) {
      const m = byFile.get(f);
      lines.push(m ? `| \`${f}\` | ${pct(m.lines)} | ${pct(m.branches)} |` : `| \`${f}\` | not loaded by any test | |`);
    }
    lines.push('', 'Report only. The goal is rising coverage on the critical files, not a number for the whole app.');
  }
  const md = lines.join('\n') + '\n';
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}

try {
  main();
} catch (e) {
  console.log('Coverage summary failed (ignored):', e.message);
}
