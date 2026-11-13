#!/usr/bin/env node
/*
 * Database call check: every supabase.rpc('name', { ... }) in the app must
 * name a function that exists, with parameter names it takes and every
 * parameter it requires, and every supabase.from('name') must name a table
 * or view that exists (since 2026-11-13: the collector saved shifts to a
 * table that never existed, TD66). Calls to functions that didn't exist, or with the
 * wrong parameter names, failed silently in production for weeks (TD37,
 * TD38, admin exec_sql, the dead admin service layer); unit tests mock the
 * database, so only a check against the real signatures finds them.
 *
 * Known functions and tables: scripts/ci/rpc-signatures.json (a snapshot of
 * production; "relations" lists the public tables and views, and the table
 * check is skipped while a repository's snapshot has none) plus every
 * function this repository's migrations create and every table and view its
 * migrations dated on or after the snapshot create, so a pull request that
 * adds one and its caller passes. Calls that already
 * fail and are tracked are listed in scripts/ci/rpc-known-problems.json with
 * their register item; an entry that no longer fails must be deleted.
 *
 *   node scripts/ci/check-rpc-calls.mjs               check (exit 1 on a new problem)
 *   node scripts/ci/check-rpc-calls.mjs --self-test   parser checks, no files
 *   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... node scripts/ci/check-rpc-calls.mjs --refresh
 *                                                     rewrite the snapshot from production
 *
 * The same script is in the household, collector and admin repositories.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '../..');
const SNAPSHOT = path.join(here, 'rpc-signatures.json');
const KNOWN = path.join(here, 'rpc-known-problems.json');
// App code only: one-off scripts and docs are not checked
const SOURCE_DIRS = ['src', 'netlify/functions', 'supabase/functions'];
const MIGRATION_DIRS = ['supabase/migrations'];
const SKIP_DIRS = new Set(['node_modules', 'build', 'dist', 'coverage', '__tests__', '__mocks__', '.git']);

// ---------- parsing ----------

/** Index just past the bracket that closes the one at `open` (strings and comments skipped), or -1 */
export function matchBracket(s, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const stack = [pairs[s[open]]];
  for (let i = open + 1; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < s.length && s[i] !== c; i++) if (s[i] === '\\') i++;
    } else if (c === '/' && s[i + 1] === '/') {
      while (i < s.length && s[i] !== '\n') i++;
    } else if (c === '/' && s[i + 1] === '*') {
      i = s.indexOf('*/', i + 2); if (i < 0) return -1; i++;
    } else if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) { stack.pop(); if (!stack.length) return i + 1; }
  }
  return -1;
}

/** Split on commas that are not inside brackets or strings */
export function splitTopLevel(s) {
  const parts = []; let depth = 0; let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') { for (i++; i < s.length && s[i] !== c; i++) if (s[i] === '\\') i++; }
    else if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { parts.push(s.slice(start, i)); start = i + 1; }
  }
  parts.push(s.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * rpc() calls in a source file: { name, line, keys } where keys is the list
 * of parameter names, [] for no parameters, or null when they can't be read
 * (a variable or a spread). Calls with a computed name are skipped.
 */
export function findRpcCalls(src) {
  const calls = [];
  const re = /\.rpc\(\s*(['"])([A-Za-z0-9_]+)\1\s*(\)|,)/g;
  let m;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    if (m[3] === ')') { calls.push({ name: m[2], line, keys: [] }); continue; }
    let i = re.lastIndex;
    while (/\s/.test(src[i])) i++;
    if (src[i] !== '{') { calls.push({ name: m[2], line, keys: null }); continue; }
    const end = matchBracket(src, i);
    if (end < 0) { calls.push({ name: m[2], line, keys: null }); continue; }
    const body = src.slice(i + 1, end - 1).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    let keys = [];
    for (const part of splitTopLevel(body)) {
      if (part.startsWith('...')) { keys = null; break; }
      const k = part.match(/^(?:(['"])([^'"]+)\1|([A-Za-z_$][\w$]*))\s*(?::|$)/);
      if (!k) { keys = null; break; }
      keys.push(k[2] || k[3]);
    }
    calls.push({ name: m[2], line, keys });
  }
  return calls;
}

/**
 * supabase.from('name') calls in a source file: { name, line }. Storage
 * buckets (storage.from) and Buffer.from / Array.from (a capitalised name
 * before .from) are not tables; a computed name is skipped.
 */
export function findTableCalls(src) {
  const calls = [];
  const re = /\.from\(\s*(['"])([A-Za-z0-9_]+)\1\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const owner = src.slice(0, m.index).match(/([A-Za-z_$][\w$]*)\s*$/)?.[1] || '';
    if (owner === 'storage' || /^[A-Z]/.test(owner)) continue;
    calls.push({ name: m[2], line: src.slice(0, m.index).split('\n').length });
  }
  return calls;
}

/** Tables and views a migration creates (lower case) */
export function findMigrationRelations(sql) {
  const clean = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Set();
  const re = /create\s+(?:or\s+replace\s+)?(?:(?:temp|temporary|unlogged)\s+)?(?:materialized\s+)?(table|view)\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?/gi;
  let m;
  while ((m = re.exec(clean))) out.add(m[2].toLowerCase());
  return out;
}

/** Functions a migration creates: { name: [{ args, defaults }] } */
export function findMigrationFunctions(sql) {
  const clean = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = {};
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?\s*\(/gi;
  let m;
  while ((m = re.exec(clean))) {
    const end = matchBracket(clean, re.lastIndex - 1);
    if (end < 0) continue;
    const args = []; let defaults = 0;
    for (const raw of splitTopLevel(clean.slice(re.lastIndex, end - 1))) {
      let part = raw.replace(/^(inout|in|variadic)\s+/i, '');
      if (/^out\s+/i.test(part)) continue;
      const hasDefault = /\sdefault\s|\s*=\s*/i.test(part);
      part = part.split(/\s+default\s+|\s*=\s*/i)[0].trim();
      const tokens = part.split(/\s+/);
      args.push(tokens.length > 1 ? tokens[0].replace(/"/g, '').toLowerCase() : '');
      if (hasDefault) defaults++;
    }
    (out[m[1].toLowerCase()] ||= []).push({ args, defaults });
  }
  return out;
}

/** Problem with a call, or null when one overload accepts it */
export function judgeCall(call, overloads) {
  if (!overloads?.length) return 'function does not exist';
  if (call.keys === null) return null;
  for (const o of overloads) {
    const required = o.args.slice(0, o.args.length - o.defaults);
    if (call.keys.every((k) => o.args.includes(k)) && required.every((a) => !a || call.keys.includes(a))) return null;
  }
  const o = overloads[0];
  const unknown = call.keys.filter((k) => !overloads.some((x) => x.args.includes(k)));
  const missing = o.args.slice(0, o.args.length - o.defaults).filter((a) => a && !call.keys.includes(a));
  return [unknown.length && `unknown parameter(s) ${unknown.join(', ')}`, missing.length && `missing ${missing.join(', ')}`]
    .filter(Boolean).join('; ') + ` (database takes ${o.args.join(', ') || 'none'})`;
}

// ---------- files ----------

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function knownFunctions() {
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const fns = structuredClone(snap.functions);
  const relations = Array.isArray(snap.relations) ? new Set(snap.relations) : null;
  // Older migrations are already in the production snapshot, including the
  // tables they created that were dropped since; only newer ones add tables
  const since = (snap.relations_generated || snap.generated || '').replace(/-/g, '');
  for (const d of MIGRATION_DIRS) {
    for (const p of walk(path.join(appRoot, d))) {
      if (!p.endsWith('.sql')) continue;
      const sql = fs.readFileSync(p, 'utf8');
      for (const [name, list] of Object.entries(findMigrationFunctions(sql))) {
        (fns[name] ||= []).push(...list);
      }
      if (relations && path.basename(p).slice(0, 8) >= since) for (const r of findMigrationRelations(sql)) relations.add(r);
    }
  }
  return { fns, relations, generated: snap.generated };
}

function check() {
  const { fns, relations, generated } = knownFunctions();
  const known = fs.existsSync(KNOWN) ? JSON.parse(fs.readFileSync(KNOWN, 'utf8')).problems || [] : [];
  const problems = []; let calls = 0; let unread = 0; let tableCalls = 0;
  for (const d of SOURCE_DIRS) {
    for (const p of walk(path.join(appRoot, d))) {
      if (!/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(p) || /\.(test|spec)\./.test(p)) continue;
      const rel = path.relative(appRoot, p).split(path.sep).join('/');
      for (const c of findRpcCalls(fs.readFileSync(p, 'utf8'))) {
        calls++; if (c.keys === null) unread++;
        const why = judgeCall(c, fns[c.name]);
        if (why) problems.push({ file: rel, line: c.line, function: c.name, why });
      }
      if (!relations) continue;
      for (const t of findTableCalls(fs.readFileSync(p, 'utf8'))) {
        tableCalls++;
        if (!relations.has(t.name.toLowerCase())) problems.push({ file: rel, line: t.line, table: t.name, why: 'table or view does not exist' });
      }
    }
  }
  const nameOf = (x) => x.function || x.table;
  const isKnown = (pr) => known.find((k) => k.file === pr.file && nameOf(k) === nameOf(pr));
  const fresh = problems.filter((pr) => !isKnown(pr));
  const stale = known.filter((k) => !problems.some((pr) => pr.file === k.file && nameOf(pr) === nameOf(k)));
  console.log(`Database call check: ${calls} rpc() calls (${unread} with parameters that can't be read statically), signatures from production ${generated} plus this repository's migrations.`);
  console.log(relations
    ? `Table check: ${tableCalls} from() calls against ${relations.size} tables and views.`
    : 'Table check skipped: scripts/ci/rpc-signatures.json has no "relations" yet (run --refresh).');
  problems.filter(isKnown).forEach((pr) => console.log(`  known (${isKnown(pr).ref}): ${pr.file}:${pr.line} ${nameOf(pr)}: ${pr.why}`));
  fresh.forEach((pr) => console.log(`::error file=${pr.file},line=${pr.line}::${nameOf(pr)}: ${pr.why}`));
  stale.forEach((k) => console.log(`::error file=scripts/ci/rpc-known-problems.json::${k.file} ${nameOf(k)} no longer fails: delete it from the known list`));
  if (fresh.length || stale.length) {
    console.log(`\n${fresh.length} new problem(s), ${stale.length} stale known entr(ies). If the function or table was created in production after ${generated}, refresh the snapshot (--refresh) in this pull request.`);
    process.exit(1);
  }
  console.log('OK');
}

// ---------- refresh ----------

export const SIGNATURES_SQL = `select p.proname as n, coalesce(p.proargnames[1:p.pronargs], '{}') as a, p.pronargdefaults as d
from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
where ns.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
  and not exists (select 1 from pg_depend dep where dep.classid = 'pg_proc'::regclass and dep.objid = p.oid and dep.deptype = 'e')
order by p.proname, p.pronargs`;

export const RELATIONS_SQL = `select c.relname as n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
where ns.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
  and not exists (select 1 from pg_depend dep where dep.classid = 'pg_class'::regclass and dep.objid = c.oid and dep.deptype = 'e')
order by c.relname`;

async function refresh() {
  const token = process.env.SUPABASE_ACCESS_TOKEN; const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) { console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF (production).'); process.exit(2); }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: SIGNATURES_SQL }),
  });
  if (!res.ok) { console.error(`Could not read the signatures: HTTP ${res.status}`); process.exit(2); }
  const rows = await res.json();
  const relRes = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: RELATIONS_SQL }),
  });
  if (!relRes.ok) { console.error(`Could not read the tables: HTTP ${relRes.status}`); process.exit(2); }
  const relations = (await relRes.json()).map((r) => r.n);
  const functions = {};
  for (const r of rows) (functions[r.n] ||= []).push({ args: r.a || [], defaults: Number(r.d) || 0 });
  const old = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const snap = { ...old, generated: new Date().toISOString().slice(0, 10), relations, functions: Object.fromEntries(Object.entries(functions).sort()) };
  fs.writeFileSync(SNAPSHOT, JSON.stringify(snap, null, 0).replace(/\],"/g, '],\n"') + '\n');
  console.log(`Snapshot written: ${Object.keys(functions).length} functions, ${relations.length} tables and views.`);
}

// ---------- self-test ----------

function selfTest() {
  const assert = (ok, what) => { if (!ok) { console.error(`self-test failed: ${what}`); process.exit(1); } };
  const calls = findRpcCalls(`
    supabase.rpc('a_fn', { p_id: id, p_note: note || null, // comment, with: colon
      p_list: [1, 2], p_obj: { x: 1 } });
    await supabase.rpc("no_args");
    supabase.rpc('shorthand', { p_user_id, p_lat: lat });
    supabase.rpc('spread', { ...params });
    supabase.rpc('variable', params);
    supabase.rpc(\`dynamic_\${x}\`, {});`);
  assert(calls.length === 5, 'finds the static calls only');
  assert(JSON.stringify(calls[0].keys) === '["p_id","p_note","p_list","p_obj"]', 'reads keys, not values or nested keys');
  assert(calls[1].keys.length === 0 && calls[2].keys.join() === 'p_user_id,p_lat', 'no-argument and shorthand calls');
  assert(calls[3].keys === null && calls[4].keys === null, 'spread and variable parameters are not guessed');
  const fns = findMigrationFunctions(`-- create function public.commented(x int)
    CREATE OR REPLACE FUNCTION public.td_x(p_id uuid, p_amount numeric(10,2) DEFAULT 0, OUT total int, p_note text = null)
    RETURNS int AS $$ select 1 $$ LANGUAGE sql;
    create function "public"."Two"(int) returns int as $$ select 1 $$ language sql;`);
  assert(!fns.commented, 'commented-out functions are ignored');
  assert(JSON.stringify(fns.td_x) === '[{"args":["p_id","p_amount","p_note"],"defaults":2}]', 'migration arguments, defaults and OUT parameters');
  assert(fns.two?.[0].args[0] === '', 'unnamed argument');
  const sig = [{ args: ['p_id', 'p_note'], defaults: 1 }];
  assert(judgeCall({ keys: ['p_id'] }, sig) === null && judgeCall({ keys: ['p_id', 'p_note'] }, sig) === null, 'accepts a valid call');
  assert(/unknown parameter\(s\) p_user/.test(judgeCall({ keys: ['p_user'] }, sig)), 'flags an unknown parameter');
  assert(/missing p_id/.test(judgeCall({ keys: [] }, sig)), 'flags a missing required parameter');
  assert(judgeCall({ keys: ['x'] }, undefined) === 'function does not exist', 'flags a missing function');
  assert(judgeCall({ keys: null }, sig) === null, 'unreadable parameters only need the function');
  assert(judgeCall({ keys: ['p_a'] }, [{ args: ['p_b'], defaults: 0 }, { args: ['p_a'], defaults: 0 }]) === null, 'any overload may match');
  const tables = findTableCalls(`
    supabase.from('pickup_requests').select('*');
    supabase
      .from("digital_bins")
      .insert(row);
    supabase.storage.from('bin-photos').upload(p);
    supabase.storage
      .from('avatars');
    Buffer.from('jpegbytes'); Array.from('abc');
    supabase.from(tableName);`);
  assert(tables.map((t) => t.name).join() === 'pickup_requests,digital_bins', `tables only, not storage buckets, Buffer or Array (${JSON.stringify(tables)})`);
  assert(tables[1].line === 4, 'line of a chained from()');
  const rels = findMigrationRelations(`-- create table public.commented (id int);
    create table if not exists public.bin_reminders (id uuid);
    CREATE OR REPLACE VIEW "public"."Admin_View" AS select 1;
    create materialized view perf as select 1;
    create unlogged table scratch (x int);`);
  assert([...rels].sort().join() === 'admin_view,bin_reminders,perf,scratch', `migration tables and views (${[...rels]})`);
  console.log('self-test passed');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--self-test')) selfTest();
  else if (process.argv.includes('--refresh')) refresh();
  else check();
}
