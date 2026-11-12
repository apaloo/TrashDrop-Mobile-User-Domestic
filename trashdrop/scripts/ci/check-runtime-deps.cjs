#!/usr/bin/env node
/*
 * Every package the shipped code imports must be listed in "dependencies".
 *
 * Why: the dependency audit gate (npm audit --omit=dev) only looks at
 * "dependencies", so a shipped package listed as a dev dependency is never
 * audited; and a package that isn't listed at all only works while another
 * package happens to bring it in, so any update can break the build. Found
 * on 2026-11-12: @supabase/supabase-js listed as dev-only, lodash present only
 * through Cypress, prop-types not installed at all, uuid undeclared.
 *
 * Usage: node scripts/ci/check-runtime-deps.cjs <dir> [<dir> ...]
 *   (from the folder that holds package.json; tests and mocks are skipped)
 *        node scripts/ci/check-runtime-deps.cjs --self-test
 * Same script in the household, carter and admin repositories.
 */
const fs = require('fs');
const path = require('path');
const builtin = new Set(require('module').builtinModules);

const SKIP_DIRS = /^(__tests__|__mocks__|__checks__|test-utils|test-helpers|tests|node_modules)$/;
const SKIP_FILES = /(\.(test|spec)\.|setupTests)/;
const IMPORT = /(?:\bimport\s[^'"]*?\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

function packageName(spec) {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('virtual:') || spec.startsWith('node:')) return null;
  const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  return builtin.has(name) ? null : name;
}

function importsIn(source) {
  const names = new Set();
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const m of code.matchAll(IMPORT)) {
    const n = packageName(m[1]);
    if (n) names.add(n);
  }
  return names;
}

function scan(dirs) {
  const found = new Map();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.test(e.name)) walk(p); continue; }
      if (!/\.(m?jsx?|cjs|tsx?)$/.test(e.name) || SKIP_FILES.test(e.name)) continue;
      for (const n of importsIn(fs.readFileSync(p, 'utf8'))) if (!found.has(n)) found.set(n, p);
    }
  };
  dirs.forEach(walk);
  return found;
}

function judge(found, pkg) {
  const deps = new Set(Object.keys(pkg.dependencies || {}));
  const dev = new Set(Object.keys(pkg.devDependencies || {}));
  const problems = [];
  for (const [name, file] of found) {
    if (deps.has(name)) continue;
    problems.push(dev.has(name)
      ? `${name} is imported by shipped code (${file}) but listed under devDependencies: move it to dependencies`
      : `${name} is imported by shipped code (${file}) but not listed in dependencies: add it`);
  }
  return problems;
}

function selfTest() {
  const assert = (ok, what) => { if (!ok) { console.error(`self-test failed: ${what}`); process.exit(1); } };
  const src = [
    "import React from 'react';",
    "import { debounce } from 'lodash/debounce';",
    "import x from './local';",
    "const s = require('@supabase/supabase-js');",
    "const m = await import('leaflet');",
    "import 'leaflet/dist/leaflet.css';",
    "import fs from 'node:fs'; import path from 'path';",
    "import { registerSW } from 'virtual:pwa-register';",
    "// import gone from 'commented-out';",
    "/* import gone2 from 'block-comment'; */",
  ].join('\n');
  const names = [...importsIn(src)].sort();
  assert(JSON.stringify(names) === JSON.stringify(['@supabase/supabase-js', 'leaflet', 'lodash', 'react']), `imports parsed: ${names}`);
  const found = new Map([['react', 'a.js'], ['lodash', 'b.js'], ['@supabase/supabase-js', 'c.js']]);
  const p = judge(found, { dependencies: { react: '1' }, devDependencies: { '@supabase/supabase-js': '2' } });
  assert(p.length === 2 && p.some((x) => x.startsWith('lodash') && x.includes('add it')) && p.some((x) => x.startsWith('@supabase') && x.includes('move it')), 'judge');
  console.log('check-runtime-deps self-test passed');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: check-runtime-deps.cjs <dir> [<dir> ...]'); process.exit(2); }
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const problems = judge(scan(dirs), pkg);
  if (problems.length) {
    console.error(`❌ ${problems.length} shipped import(s) not declared as runtime dependencies:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`✅ Every package the shipped code in ${dirs.join(', ')} imports is listed in dependencies.`);
}
