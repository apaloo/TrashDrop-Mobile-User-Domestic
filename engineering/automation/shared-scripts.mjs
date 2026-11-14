#!/usr/bin/env node
/*
 * Shared CI scripts stay the same in all three apps.
 *
 * Six scripts in scripts/ci/ (runtime dependencies, owned domains, database
 * calls, coverage floors, unused files, log privacy) are meant to be one
 * script in three repositories: a fix made in one must reach the others.
 * Nothing checked that (2026-11-13). This compares the collector's and the
 * admin site's copies on their main branch with this repository's copy (the
 * source: change it here first, then copy it), byte for byte. Shared files
 * outside scripts/ci/ (the browser tests' fake Supabase) are compared the same way.
 *
 * Reads public raw files, so it needs no token. Writes shared-scripts-result.json
 * ({ outOfStep: [{ script, repo, problem }] }) for the workflow, and a
 * Markdown summary. Exit 1 when a copy differs or can't be read.
 *
 *   node engineering/automation/shared-scripts.mjs              compare
 *   node engineering/automation/shared-scripts.mjs --self-test  check the rules
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(here, 'shared-scripts-config.json'), 'utf8'));

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);

/**
 * Everything compared: each script in scripts/ci/ (sourceDir here, each
 * repository's dir there), and each shared file with its own paths ("files":
 * [{ name, source, copy }], e.g. the browser tests' fake Supabase).
 * @returns {{ name: string, source: string, copy: (repo: {dir: string}) => string }[]}
 */
export const entries = (cfg) => [
  ...cfg.scripts.map((script) => ({ name: script, source: path.posix.join(cfg.sourceDir, script), copy: (repo) => path.posix.join(repo.dir, script) })),
  ...(cfg.files || []).map((f) => ({ name: f.name, source: f.source, copy: () => f.copy })),
];

/**
 * @param {{ scripts: string[], sourceDir: string, files?: {name: string, source: string, copy: string}[], repos: {name: string, slug: string, dir: string}[] }} cfg
 * @param {(file: string) => string|null} readSource  this repository's copy
 * @param {(slug: string, file: string) => Promise<string|null>} readRemote  null when it can't be read
 */
export async function compare(cfg, readSource, readRemote) {
  const rows = [];
  const outOfStep = [];
  for (const { name: script, source: sourcePath, copy: copyPath } of entries(cfg)) {
    const source = readSource(sourcePath);
    if (source === null) {
      outOfStep.push({ script, repo: 'household', problem: 'missing here (the source copy)' });
      continue;
    }
    for (const repo of cfg.repos) {
      const copy = await readRemote(repo.slug, copyPath(repo));
      let problem = null;
      if (copy === null) problem = 'missing or unreadable on main';
      else if (copy !== source) problem = `differs (here ${sha(source)}, there ${sha(copy)})`;
      rows.push({ script, repo: repo.name, ok: !problem, problem });
      if (problem) outOfStep.push({ script, repo: repo.name, problem });
    }
  }
  return { rows, outOfStep };
}

async function fetchRaw(slug, file) {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${slug}/main/${file}`);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function selfTest() {
  const assert = (ok, what) => { if (!ok) { console.error(`self-test failed: ${what}`); process.exit(1); } };
  const cfg = { scripts: ['a.cjs', 'b.mjs'], sourceDir: 'app/scripts/ci', repos: [{ name: 'collector', slug: 'o/c', dir: 'scripts/ci' }, { name: 'admin', slug: 'o/a', dir: 'scripts/ci' }] };
  const src = { 'app/scripts/ci/a.cjs': 'A', 'app/scripts/ci/b.mjs': 'B' };
  const remote = { 'o/c:scripts/ci/a.cjs': 'A', 'o/c:scripts/ci/b.mjs': 'B', 'o/a:scripts/ci/a.cjs': 'A', 'o/a:scripts/ci/b.mjs': 'B-old' };
  const r = await compare(cfg, (f) => src[f] ?? null, async (s, f) => remote[`${s}:${f}`] ?? null);
  assert(r.rows.length === 4 && r.outOfStep.length === 1 && r.outOfStep[0].repo === 'admin' && r.outOfStep[0].script === 'b.mjs', 'a differing copy');
  assert(/^differs \(here [0-9a-f]{12}, there [0-9a-f]{12}\)$/.test(r.outOfStep[0].problem), 'says how it differs');
  delete remote['o/c:scripts/ci/a.cjs'];
  const r2 = await compare(cfg, (f) => src[f] ?? null, async (s, f) => remote[`${s}:${f}`] ?? null);
  assert(r2.outOfStep.some((x) => x.repo === 'collector' && /missing/.test(x.problem)), 'a missing copy');
  const r3 = await compare({ ...cfg, scripts: ['gone.cjs'] }, () => null, async () => 'x');
  assert(r3.outOfStep[0].repo === 'household', 'a missing source');
  const withFile = { ...cfg, scripts: [], files: [{ name: 'fake.mjs', source: 'app/e2e/fake.mjs', copy: 'tests/fake.mjs' }] };
  const r4 = await compare(withFile, (f) => (f === 'app/e2e/fake.mjs' ? 'F' : null), async (s, f) => (f === 'tests/fake.mjs' ? (s === 'o/c' ? 'F' : 'F-old') : null));
  assert(r4.rows.length === 2 && r4.outOfStep.length === 1 && r4.outOfStep[0].repo === 'admin' && r4.outOfStep[0].script === 'fake.mjs', 'a shared file at its own paths');
  assert(config.scripts.length >= 6 && config.repos.length === 2, 'config lists the shared scripts and both repositories');
  assert((config.files || []).every((f) => f.name && f.source && f.copy && fs.existsSync(path.join(here, '..', '..', f.source))), 'every shared file has a name, a source that exists here, and a copy path');
  console.log('shared-scripts self-test passed');
}

async function main() {
  const root = path.join(here, '..', '..');
  const { rows, outOfStep } = await compare(
    config,
    (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch { return null; } },
    fetchRaw,
  );
  const lines = ['### Shared CI scripts', '', '| Script | ' + config.repos.map((r) => r.name).join(' | ') + ' |', '|---|' + config.repos.map(() => '---|').join('')];
  for (const { name: script } of entries(config)) {
    lines.push(`| \`${script}\` | ` + config.repos.map((repo) => {
      const row = rows.find((x) => x.script === script && x.repo === repo.name);
      return row ? (row.ok ? '✅ same' : `❌ ${row.problem}`) : '❌';
    }).join(' | ') + ' |');
  }
  lines.push('', outOfStep.length
    ? `**${outOfStep.length} copy(ies) out of step.** Copy the household version (\`${config.sourceDir}/\`, or the file's own path above) into the other repository in a pull request there.`
    : '**All copies are the same as the household version.**');
  const md = lines.join('\n') + '\n';
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  fs.writeFileSync('shared-scripts-result.json', JSON.stringify({ outOfStep }, null, 2));
  process.exit(outOfStep.length ? 1 : 0);
}

if (process.argv.includes('--self-test')) await selfTest();
else await main();
