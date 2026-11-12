#!/usr/bin/env node
/*
 * Shipped code may only name TrashDrop domains that TrashDrop owns.
 *
 * Why (TD58): trashdrop.app belongs to someone else, yet every digital bin's
 * QR link, the WhatsApp guest account's email and a collector email fallback
 * used it, so phone-camera scans and password resets went to a stranger.
 * Any host or email address containing "trashdrop" must be on the allowed
 * list: trashdrops.com and its subdomains, plus what --allow adds.
 *
 * Usage (from the folder that holds package.json):
 *   node scripts/ci/check-domains.cjs [--allow host ...] [--migrations dir --since version (only later ones)] <dir|file> ...
 *   node scripts/ci/check-domains.cjs --self-test
 * Tests, mocks and comments are skipped (tests may name old domains on
 * purpose, to prove old links still work). Same script in all three repos.
 */
const fs = require('fs');
const path = require('path');

const OWNED = ['trashdrops.com'];
const SKIP_DIRS = /^(__tests__|__mocks__|__checks__|test-utils|test-helpers|tests|node_modules)$/;
const SKIP_FILES = /(\.(test|spec)\.|setupTests)/;
const SCANNED = /\.(m?jsx?|cjs|tsx?|html|sql|toml|json)$/;
const DOMAIN = /\b(?:[a-z0-9-]+\.)*trashdrops?\.[a-z]{2,}\b/gi;

function stripComments(code, file) {
  if (file.endsWith('.sql')) return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
  if (file.endsWith('.html')) return code.replace(/<!--[\s\S]*?-->/g, '');
  if (file.endsWith('.toml')) return code.replace(/^\s*#[^\n]*/gm, '');
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

const isOwned = (host, allowed) => allowed.some((d) => host === d || host.endsWith(`.${d}`));

function findInText(text, file, allowed) {
  const problems = [];
  stripComments(text, file).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(DOMAIN)) {
      const host = m[0].toLowerCase();
      if (!isOwned(host, allowed)) problems.push(`${file}:${i + 1}: ${host}`);
    }
  });
  return problems;
}

function scan(targets, allowed) {
  const problems = [];
  const visit = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(p)) if (!SKIP_DIRS.test(e)) visit(path.join(p, e));
    } else if (SCANNED.test(p) && !SKIP_FILES.test(path.basename(p))) {
      problems.push(...findInText(fs.readFileSync(p, 'utf8'), p, allowed));
    }
  };
  targets.forEach((t) => fs.existsSync(t) && visit(t));
  return problems;
}

function selfTest() {
  const assert = (ok, what) => { if (!ok) { console.error(`self-test failed: ${what}`); process.exit(1); } };
  const allowed = [...OWNED];
  assert(findInText("const u = 'https://app.trashdrops.com/bin/' + id;", 'a.js', allowed).length === 0, 'owned subdomain ok');
  assert(findInText("const e = 'support@trashdrops.com';", 'a.js', allowed).length === 0, 'owned email ok');
  assert(findInText("const u = 'https://trashdrop.app/bin/' + id;", 'a.js', allowed)[0] === 'a.js:1: trashdrop.app', 'unowned domain caught');
  assert(findInText("email: `${phone}@trashdrop.app`", 'a.jsx', allowed).length === 1, 'unowned email caught');
  assert(findInText("// the old trashdrop.app link\n/* trashdrop.app */ const ok = 1;", 'a.js', allowed).length === 0, 'comments skipped');
  assert(findInText("-- was trashdrop.app\nselect 'https://trashdrop.app/x';", 'm.sql', allowed).length === 1, 'sql comment skipped, code caught');
  assert(findInText("fetch('https://x.trashdrops.com.evil.example/')", 'a.js', allowed).length === 0, 'not a trashdrop domain at all');
  assert(findInText("const s = 'https://trashdropsx.com';", 'a.js', allowed).length === 0, 'other names untouched');
  assert(findInText("admin@trashdrop.com", 'a.js', [...allowed, 'trashdrop.com']).length === 0, '--allow works');
  console.log('check-domains self-test passed');
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) { selfTest(); process.exit(0); }
const allowed = [...OWNED];
const targets = [];
let migrations = null; let since = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--allow') allowed.push(args[++i].toLowerCase());
  else if (args[i] === '--migrations') migrations = args[++i];
  else if (args[i] === '--since') since = args[++i];
  else targets.push(args[i]);
}
if (migrations) {
  for (const f of fs.readdirSync(migrations)) {
    const version = f.split('_')[0];
    if (f.endsWith('.sql') && /^\d{8,14}$/.test(version) && (!since || version > since)) targets.push(path.join(migrations, f));
  }
}
const problems = scan(targets, allowed);
if (problems.length) {
  console.error(`❌ ${problems.length} reference(s) to a TrashDrop domain we don't own (allowed: ${allowed.join(', ')}; TD58):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`✅ Only owned TrashDrop domains (${allowed.join(', ')}) in ${targets.length} target(s).`);
