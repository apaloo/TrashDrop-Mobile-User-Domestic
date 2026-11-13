#!/usr/bin/env node
/*
 * Every source file must be reachable from the app's entry points.
 *
 * Why: on 2026-11-13 the three apps carried 60 source files (about 11,000
 * lines) that nothing used: old copies, debug panels, sync helpers for queues
 * nothing filled, a second AuthContext. They hid real bugs (a bin location
 * "saved for later" that nothing could send), drew coverage down and were
 * read as if they ran. This check stops new ones.
 *
 * Reachable means: followed from the <script src> entries in index.html,
 * any src/ path named in the Vite config, every test file, and the
 * allowlist, through static imports, dynamic import(), require() and
 * new URL('…', import.meta.url) (workers). A file only a test uses counts as
 * used; remove the test with the file.
 *
 * Allowlist: scripts/ci/unused-files-allowlist.txt, one path per line
 * relative to the folder with package.json, then " # " and the reason.
 *
 * Usage: node scripts/ci/check-unused-files.cjs [src]
 *        node scripts/ci/check-unused-files.cjs --self-test
 * Same script in the household, collector and admin repositories.
 */
const fs = require('fs');
const path = require('path');

const CODE = /\.(m?jsx?|tsx?|cjs)$/;
const TEST = /(\.(test|spec)\.[^.]+$|(^|\/)(__tests__|__mocks__|__checks__|test-utils|test-fixtures|tests)\/|setupTests\.)/;
const REFS = [
  /\bimport\s[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bexport\s[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bnew\s+URL\s*\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g,
];
const EXT = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (CODE.test(e.name)) out.push(p);
  }
  return out;
}

const rel = (root, p) => path.relative(root, p).split(path.sep).join('/');

function readAllowlist(root) {
  const file = path.join(root, 'scripts/ci/unused-files-allowlist.txt');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [p, reason] = l.split(/\s+#\s+/);
      return { path: p.trim(), reason: (reason || '').trim() };
    });
}

function entryPoints(root) {
  const found = [];
  const html = path.join(root, 'index.html');
  if (fs.existsSync(html)) {
    for (const m of fs.readFileSync(html, 'utf8').matchAll(/<script[^>]*\bsrc=["']\/?([^"']+)["']/g)) found.push(m[1]);
  }
  for (const name of fs.readdirSync(root)) {
    if (!/^vite\.config\./.test(name)) continue;
    for (const m of fs.readFileSync(path.join(root, name), 'utf8').matchAll(/['"`]\.?\/?(src\/[\w./-]+)['"`]/g)) found.push(m[1]);
  }
  return found;
}

function resolve(fromFile, spec, known) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // packages
  const base = spec.startsWith('/') ? spec : path.join(path.dirname(fromFile), spec);
  for (const e of EXT) {
    const cand = path.normalize(base + e);
    if (known.has(cand)) return cand;
  }
  return null;
}

/** Returns { unused: [relative paths], staleAllowlist: [entries] } */
function check(root, srcDir = 'src') {
  const files = walk(path.join(root, srcDir));
  const known = new Set(files);
  const allow = readAllowlist(root);
  const roots = new Set();
  for (const e of entryPoints(root)) {
    const r = resolve(path.join(root, 'index.html'), './' + e, known);
    if (r) roots.add(r);
  }
  for (const f of files) if (TEST.test(rel(root, f))) roots.add(f);
  for (const a of allow) {
    const p = path.normalize(path.join(root, a.path));
    if (known.has(p)) roots.add(p);
  }

  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const re of REFS) {
      for (const m of code.matchAll(re)) {
        const r = resolve(f, m[1], known);
        if (r && !seen.has(r)) queue.push(r);
      }
    }
  }

  const unused = files.filter((f) => !seen.has(f)).map((f) => rel(root, f)).sort();
  const staleAllowlist = allow.filter((a) => !known.has(path.normalize(path.join(root, a.path))) || !a.reason);
  return { unused, staleAllowlist };
}

function selfTest() {
  const os = require('os');
  const assert = (ok, what) => { if (!ok) { console.error(`self-test failed: ${what}`); process.exit(1); } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unused-files-'));
  const put = (p, s) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), s); };
  put('index.html', '<script type="module" src="/src/main.jsx"></script>');
  put('src/main.jsx', "import App from './App';\nconst P = () => import('./pages/Lazy.jsx');\nnew Worker(new URL('./workers/w.js', import.meta.url));\n");
  put('src/App.jsx', "export { default as x } from './utils/x.js';\n// import Old from './Old';\n");
  put('src/utils/x.js', "const y = require('./y');\n");
  put('src/utils/y.js', 'module.exports = 1;');
  put('src/pages/Lazy.jsx', 'export default 1;');
  put('src/workers/w.js', '');
  put('src/Old.jsx', "import './OldHelper';\n");          // dead, and keeps its helper alive only by itself
  put('src/OldHelper.js', '');
  put('src/onlyTested.js', '');
  put('src/__tests__/onlyTested.test.js', "import '../onlyTested';\n");
  put('src/kept.js', '');
  put('scripts/ci/unused-files-allowlist.txt', '# comment\nsrc/kept.js # loaded by name\nsrc/gone.js # removed since\n');
  const r = check(dir);
  assert(JSON.stringify(r.unused) === JSON.stringify(['src/Old.jsx', 'src/OldHelper.js']), `unused was ${JSON.stringify(r.unused)}`);
  assert(r.staleAllowlist.length === 1 && r.staleAllowlist[0].path === 'src/gone.js', 'a stale allowlist entry is reported');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('check-unused-files self-test passed');
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    const root = process.cwd();
    const srcDir = process.argv[2] || 'src';
    const { unused, staleAllowlist } = check(root, srcDir);
    let failed = false;
    if (unused.length) {
      failed = true;
      console.error(`${unused.length} source file(s) nothing uses (not reachable from index.html, the Vite config or a test):`);
      unused.forEach((f) => console.error(`  ${f}`));
      console.error('Remove them, or list them with a reason in scripts/ci/unused-files-allowlist.txt if they are loaded in a way this check cannot see.');
    }
    if (staleAllowlist.length) {
      failed = true;
      console.error('Allowlist entries that no longer exist or have no reason:');
      staleAllowlist.forEach((a) => console.error(`  ${a.path}`));
    }
    if (failed) process.exit(1);
    console.log('check-unused-files: every source file is reachable');
  }
}

module.exports = { check };
