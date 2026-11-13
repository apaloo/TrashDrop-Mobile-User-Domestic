#!/usr/bin/env node
/*
 * No personal data in console logs (data protection controls).
 *
 * Why: on 2026-11-13 the household app wrote the person's email address to
 * the browser console at every sign-in, sign-up and password reset, and a
 * new location's address and coordinates when it was saved. A shared phone's
 * console, a support screenshot or a browser extension can read it there.
 *
 * Looks at every console.* and logger.* call in src and fails when a value it
 * logs (not the message text) names an email, phone number, person's name or
 * address: email, phone, phone_number, msisdn, first_name, last_name,
 * full_name / fullName, address, or .email / .phone on an object. Log that
 * something happened, or a yes/no (hasEmail: !!email), never the value.
 *
 * Exceptions: scripts/ci/log-privacy-allowlist.txt, one per line:
 *   <path> | <text from the line> # why it is not personal data
 * (by text, not line number, so edits elsewhere in the file don't break it).
 *
 * Usage: node scripts/ci/check-log-privacy.cjs [src]
 *        node scripts/ci/check-log-privacy.cjs --self-test
 * Same script in the household, collector and admin repositories.
 */
const fs = require('fs');
const path = require('path');

const CALL = /\b(?:console|logger|log)\.(?:log|info|debug|warn|error|trace)\s*\(/g;
const PERSONAL = /(?:^|[^\w$.])(?:email|emails|userEmail|phone|phoneNumber|phone_number|msisdn|first_name|last_name|full_name|fullName|address)(?![\w$])|\.(?:email|phone|phone_number|full_name|first_name|last_name)(?![\w$])/;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(m?jsx?|tsx?)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(p);
  }
  return out;
}

/** The arguments of the call starting at `start` (just after its "("), up to the matching ")" */
function argumentsAt(code, start) {
  let depth = 1; let i = start; let quote = null;
  for (; i < code.length && depth > 0; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  return code.slice(start, i - 1);
}

/** The values a call logs: the arguments with string text removed (template ${…} parts kept) */
function loggedValues(args) {
  return args
    .replace(/`(?:[^`\\]|\\.)*`/g, (t) => ' ' + [...t.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]).join(' ') + ' ')
    .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, ' S ')
    // object keys name a field, not a value: "{ email: x }" logs x
    .replace(/([{,]\s*)([\w$]+)\s*:/g, '$1')
    // a yes/no is not the value: "!!email", "!!user?.email"
    .replace(/!!\s*[\w$]+(?:\??\.[\w$]+)*/g, ' B ');
}

/** [{ line, text }] of log calls in `source` that log personal data */
function findInSource(source) {
  const out = [];
  const code = source.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/[^\n]*/g, (c, p) => p + ' '.repeat(c.length - p.length));
  for (const m of code.matchAll(CALL)) {
    const args = argumentsAt(code, m.index + m[0].length);
    if (PERSONAL.test(loggedValues(args))) {
      const line = code.slice(0, m.index).split('\n').length;
      out.push({ line, text: source.split('\n')[line - 1].trim() });
    }
  }
  return out;
}

function readAllowlist(root) {
  const file = path.join(root, 'scripts/ci/log-privacy-allowlist.txt');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    const [where, reason = ''] = l.split(/\s+#\s+/);
    const [p, snippet = ''] = where.split(/\s*\|\s*/);
    return { path: p.trim(), snippet: snippet.trim(), reason: reason.trim(), used: false };
  });
}

function check(root, srcDir = 'src') {
  const allow = readAllowlist(root);
  const problems = [];
  for (const f of walk(path.join(root, srcDir))) {
    const r = path.relative(root, f).split(path.sep).join('/');
    for (const hit of findInSource(fs.readFileSync(f, 'utf8'))) {
      const a = allow.find((x) => x.path === r && x.snippet && hit.text.includes(x.snippet));
      if (a) { a.used = true; continue; }
      problems.push(`${r}:${hit.line}: ${hit.text.slice(0, 140)}`);
    }
  }
  const stale = allow.filter((a) => !a.used || !a.reason || !a.snippet).map((a) => `${a.path} | ${a.snippet}`);
  return { problems, stale };
}

function selfTest() {
  const assert = (ok, what) => { if (!ok) { console.error(`self-test failed: ${what}`); process.exit(1); } };
  const hits = (s) => findInSource(s).length;
  assert(hits("console.log('[Auth] Signing up:', email);") === 1, 'a bare email');
  assert(hits('console.log(`Using credentials: ${email}`);') === 1, 'an email in a template');
  assert(hits("logger.info('user', { id: user.id, phone: user.phone });") === 1, '.phone on an object');
  assert(hits("console.log('x', { userId, name, address, latitude });") === 1, 'an address');
  assert(hits("console.log('Sign in', {\n  email: formData.email,\n  n: 1\n});") === 1, 'over several lines');
  assert(hits("console.log('[Auth] Requesting password reset for your email address');") === 0, 'the word email in the message');
  assert(hits("console.log('[Auth] attempt', { hasEmail: !!email, rememberMe });") === 0, 'a yes/no about the email');
  assert(hits("console.log('x', { has: !!user?.email, e: user?.email });") === 1, 'the value next to a yes/no');
  assert(hits("console.log('[Auth] attempt', { hasUser: !!user, rememberMe });") === 0, 'a yes/no about something else');
  assert(hits("console.log('x', { email: 'redacted' });") === 0, 'a field name with a fixed text');
  assert(hits("// console.log('x', email);\nconst a = 1;") === 0, 'a commented-out call');
  assert(hits("console.log('url', 'https://x.org/a?email=' + 'b');") === 0, 'a URL in a string');
  assert(hits("console.log('d', emailVerified, phoneConfirmed);") === 0, 'other identifiers that start the same');
  console.log('check-log-privacy self-test passed');
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    const { problems, stale } = check(process.cwd(), process.argv[2] || 'src');
    if (problems.length) {
      console.error(`${problems.length} log call(s) that write personal data (an email, phone number, name or address):`);
      problems.forEach((p) => console.error(`  ${p}`));
      console.error('Log that it happened, or a yes/no (hasEmail: !!email), never the value. If it is not personal data, add it to scripts/ci/log-privacy-allowlist.txt with the reason.');
    }
    if (stale.length) {
      console.error('Allowlist entries that match nothing or have no reason:');
      stale.forEach((s) => console.error(`  ${s}`));
    }
    if (problems.length || stale.length) process.exit(1);
    console.log('check-log-privacy: no personal data in log calls');
  }
}

module.exports = { findInSource, check };
