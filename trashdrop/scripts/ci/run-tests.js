#!/usr/bin/env node
/*
 * CI test runner for the household app.
 *
 * 1. Runs every Jest suite except the ones listed in known-failing-tests.txt.
 *    Any failure here fails the build.
 * 2. Runs the known-failing suites on their own, for information only, and
 *    prints which of them now pass so their lines can be deleted.
 *
 * The Supabase client refuses to load without configuration, so placeholder
 * values are used. Tests must never reach a real project.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const listFile = path.join(__dirname, 'known-failing-tests.txt');
const known = fs.readFileSync(listFile, 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

const guard = 'src/services/__tests__/digitalBinService.promotion.test.js';
if (known.includes(guard)) {
  console.error(`The pricing guard test (${guard}) must never be listed as known-failing.`);
  process.exit(1);
}

const env = {
  ...process.env,
  CI: 'true',
  REACT_APP_SUPABASE_URL: 'https://ci-placeholder.supabase.co',
  REACT_APP_SUPABASE_ANON_KEY: 'sb_publishable_ci_placeholder',
};

const escape = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const craco = path.join(root, 'node_modules', '.bin', 'craco');

console.log(`Running all suites except ${known.length} known-failing ones…`);
const main = spawnSync(craco, ['test', '--watchAll=false', '--testPathIgnorePatterns', ...known.map(escape)], {
  cwd: root, env, stdio: 'inherit',
});

if (known.length) {
  console.log('\nChecking known-failing suites (information only)…');
  const out = path.join(root, '.known-failing-results.json');
  spawnSync(craco, ['test', '--watchAll=false', '--json', `--outputFile=${out}`, ...known.map(escape)], {
    cwd: root, env, stdio: 'ignore',
  });
  try {
    const results = JSON.parse(fs.readFileSync(out, 'utf8'));
    const nowPassing = results.testResults
      .filter((r) => r.status === 'passed')
      .map((r) => path.relative(root, r.name));
    const stillFailing = known.length - nowPassing.length;
    console.log(`${stillFailing} still failing, ${nowPassing.length} now passing.`);
    for (const f of nowPassing) {
      // GitHub annotation: shows on the pull request.
      console.log(`::warning file=trashdrop/scripts/ci/known-failing-tests.txt::${f} passes now. Delete it from known-failing-tests.txt.`);
    }
  } catch (e) {
    console.log('Could not read known-failing results:', e.message);
  } finally {
    fs.rmSync(out, { force: true });
  }
}

process.exit(main.status === null ? 1 : main.status);
