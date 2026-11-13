#!/usr/bin/env node
/*
 * Every source file must be reachable from the app's entry points, and every
 * export must be used somewhere.
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
 * Exports (added 2026-11-13, after 57 exported functions and constants nothing
 * used were removed from the three apps): an exported name must appear in
 * another file (app code, tests, Netlify or Edge functions, scripts,
 * Cypress) or be used inside its own file. By name, so it never calls a used
 * export unused; it can miss an unused one whose name is common.
 *
 * Allowlist: scripts/ci/unused-files-allowlist.txt, one entry per line
 * relative to the folder with package.json, then " # " and the reason. An
 * entry is a file (src/a.js) or an export (src/a.js:name, or src/a.js:* for
 * all of a file's exports).
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
const EXPORT_DECL = /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST = /^export\s*\{([^}]*)\}(?!\s*from)/gm;
const OTHER_DIRS = ['netlify', 'supabase/functions', 'scripts', 'cypress'];
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

/** [{ name, local, mentions }]: mentions is how often the name appears in its own file just by being declared and exported */
function exportsOf(code) {
  const out = [...code.matchAll(EXPORT_DECL)].map((m) => ({ name: m[1], local: m[1], mentions: 1 }));
  for (const m of code.matchAll(EXPORT_LIST)) {
    for (const part of m[1].split(',')) {
      const [local, alias] = part.trim().split(/\s+as\s+/).map((x) => x && x.trim());
      const name = alias || local;
      if (name && name !== 'default') out.push({ name, local, mentions: 2 }); // declared, then listed
    }
  }
  return out;
}
const exportedNames = (code) => [...new Set(exportsOf(code).map((e) => e.name))];

const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Exports no other file names and their own file doesn't use: [ 'src/a.js:name' ] */
function unusedExports(root, files, allow) {
  const others = OTHER_DIRS.flatMap((d) => walk(path.join(root, d)));
  const text = new Map([...files, ...others].map((f) => [f, stripComments(fs.readFileSync(f, 'utf8'))]));
  const allowed = new Set(allow.map((a) => a.path));
  const out = [];
  for (const f of files) {
    const r = rel(root, f);
    if (TEST.test(r) || allowed.has(`${r}:*`)) continue;
    const own = text.get(f);
    for (const { name, local, mentions } of exportsOf(own)) {
      if (allowed.has(`${r}:${name}`)) continue;
      const wordFor = (n) => new RegExp(`(^|[^\\w$])${n.replace(/\$/g, '\\$')}(?![\\w$])`, 'g');
      if ((own.match(wordFor(local)) || []).length > mentions) continue; // used in its own file
      const word = wordFor(name);
      let used = false;
      for (const [g, code] of text) {
        if (g !== f && word.test(code)) { used = true; break; }
        word.lastIndex = 0;
      }
      if (!used) out.push(`${r}:${name}`);
    }
  }
  return out.sort();
}

/** Returns { unused: [relative paths], unusedExports: ['path:name'], staleAllowlist: [entries] } */
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
    if (a.path.includes(':')) continue; // an export entry
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
  const reachable = files.filter((f) => seen.has(f));
  const staleAllowlist = allow.filter((a) => {
    if (!a.reason) return true;
    const [p, name] = a.path.split(':');
    const file = path.normalize(path.join(root, p));
    if (!known.has(file)) return true;
    return name && name !== '*' && !exportedNames(stripComments(fs.readFileSync(file, 'utf8'))).includes(name);
  });
  return { unused, unusedExports: unusedExports(root, reachable, allow), staleAllowlist };
}

function selfTest() {
  const os = require('os');
  const assert = (ok, what) => { if (!ok) { console.error(`self-test failed: ${what}`); process.exit(1); } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unused-files-'));
  const put = (p, s) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), s); };
  put('index.html', '<script type="module" src="/src/main.jsx"></script>');
  put('src/main.jsx', "import App from './App';\nimport './useLib';\nimport './lib2';\nconst P = () => import('./pages/Lazy.jsx');\nnew Worker(new URL('./workers/w.js', import.meta.url));\n");
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
  put('src/lib.js', "export const usedOutside = 1;\nexport function usedInside() {}\nexport const deadOne = usedInside();\nexport { deadToo };\nconst deadToo = 2;\nexport const allowedOne = 3;\nexport default 4;\n");
  put('src/useLib.js', "import { usedOutside } from './lib';\n// deadOne is only named in a comment here\n");
  put('netlify/functions/fn.js', "const { onlyNetlify } = require('../../src/lib2');\n");
  put('src/lib2.js', "export const onlyNetlify = 1;\n");
  put('scripts/ci/unused-files-allowlist.txt', '# comment\nsrc/kept.js # loaded by name\nsrc/gone.js # removed since\nsrc/lib.js:allowedOne # a public API\nsrc/lib.js:renamed # was removed\n');
  const r = check(dir);
  assert(JSON.stringify(r.unused) === JSON.stringify(['src/Old.jsx', 'src/OldHelper.js']), `unused was ${JSON.stringify(r.unused)}`);
  assert(JSON.stringify(r.unusedExports) === JSON.stringify(['src/lib.js:deadOne', 'src/lib.js:deadToo']), `unused exports were ${JSON.stringify(r.unusedExports)}`);
  assert(JSON.stringify(r.staleAllowlist.map((a) => a.path)) === JSON.stringify(['src/gone.js', 'src/lib.js:renamed']), `stale was ${JSON.stringify(r.staleAllowlist)}`);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('check-unused-files self-test passed');
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    const root = process.cwd();
    const srcDir = process.argv[2] || 'src';
    const { unused, unusedExports: deadExports, staleAllowlist } = check(root, srcDir);
    let failed = false;
    if (unused.length) {
      failed = true;
      console.error(`${unused.length} source file(s) nothing uses (not reachable from index.html, the Vite config or a test):`);
      unused.forEach((f) => console.error(`  ${f}`));
      console.error('Remove them, or list them with a reason in scripts/ci/unused-files-allowlist.txt if they are loaded in a way this check cannot see.');
    }
    if (deadExports.length) {
      failed = true;
      console.error(`${deadExports.length} export(s) nothing uses (no other file names them, and their own file doesn't use them):`);
      deadExports.forEach((e) => console.error(`  ${e}`));
      console.error('Remove them, or list them as path:name with a reason in scripts/ci/unused-files-allowlist.txt.');
    }
    if (staleAllowlist.length) {
      failed = true;
      console.error('Allowlist entries that no longer exist or have no reason:');
      staleAllowlist.forEach((a) => console.error(`  ${a.path}`));
    }
    if (failed) process.exit(1);
    console.log('check-unused-files: every source file is reachable and every export is used');
  }
}

module.exports = { check };
