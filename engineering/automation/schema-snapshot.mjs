// Schema snapshot (TD18, ADR-001): writes the live production schema of the
// shared database into trashdrop/supabase/schema/, one file per object, so
// there is one place to read what every table, function and view is today,
// and a readable diff whenever production changes. Generated: never edit the
// files by hand; change the database with a migration, then refresh.
//
//   node engineering/automation/schema-snapshot.mjs            (needs SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF)
//   node engineering/automation/schema-snapshot.mjs --self-test
//
// Layout:
//   tables/<table>.sql     columns, constraints, row-level security, grants, policies, triggers
//   functions/<name>.sql   every overload, with who may execute it
//   views/<view>.sql       definition, options and grants
//   README.md              counts and how to refresh
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.join(here, '..', '..', 'trashdrop', 'supabase', 'schema');
const ROLES = ['anon', 'authenticated', 'service_role'];

// Objects that belong to extensions (PostGIS etc.) are left out: they are
// installed, not written by us.
const NOT_EXTENSION = (oid, cls) => `not exists (select 1 from pg_depend d where d.objid = ${oid} and d.classid = '${cls}'::regclass and d.deptype = 'e')`;

export const QUERIES = {
  columns: `select c.relname as tbl, a.attname as col, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as not_null,
      pg_get_expr(ad.adbin, ad.adrelid) as dflt, a.attnum as pos
    from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
    where c.relkind in ('r', 'p') and ${NOT_EXTENSION('c.oid', 'pg_class')}
    order by c.relname, a.attnum`,
  tables: `select c.relname as tbl, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
      ${ROLES.map((r) => `(select string_agg(p, ',' order by p) from unnest(array['SELECT','INSERT','UPDATE','DELETE']) p where has_table_privilege('${r}', c.oid, p)) as grants_${r}`).join(', ')}
    from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind in ('r', 'p') and ${NOT_EXTENSION('c.oid', 'pg_class')}`,
  constraints: `select c.relname as tbl, k.conname as name, pg_get_constraintdef(k.oid) as def
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind in ('r', 'p') and ${NOT_EXTENSION('c.oid', 'pg_class')}`,
  indexes: `select c.relname as tbl, i.relname as name, pg_get_indexdef(i.oid) as def
    from pg_index x join pg_class i on i.oid = x.indexrelid join pg_class c on c.oid = x.indrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where not x.indisprimary and not exists (select 1 from pg_constraint k where k.conindid = i.oid)
      and ${NOT_EXTENSION('c.oid', 'pg_class')}`,
  policies: `select c.relname as tbl, p.polname as name, p.polcmd::text as cmd, p.polpermissive as permissive,
      coalesce((select string_agg(r.rolname, ', ' order by r.rolname) from pg_roles r where r.oid = any(p.polroles)), 'public') as roles,
      pg_get_expr(p.polqual, p.polrelid) as qual, pg_get_expr(p.polwithcheck, p.polrelid) as with_check
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'`,
  triggers: `select c.relname as tbl, t.tgname as name, pg_get_triggerdef(t.oid) as def, t.tgenabled::text as enabled
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where not t.tgisinternal`,
  functions: `select p.proname as name, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as def,
      ${ROLES.map((r) => `has_function_privilege('${r}', p.oid, 'EXECUTE') as exec_${r}`).join(', ')}
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.prokind in ('f', 'p') and ${NOT_EXTENSION('p.oid', 'pg_proc')}`,
  views: `select c.relname as name, c.relkind::text as kind, pg_get_viewdef(c.oid) as def, array_to_string(c.reloptions, ', ') as options,
      ${ROLES.map((r) => `has_table_privilege('${r}', c.oid, 'SELECT') as select_${r}`).join(', ')}
    from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind in ('v', 'm') and ${NOT_EXTENSION('c.oid', 'pg_class')}`,
};

const HEADER = (what) => `-- ${what}\n-- Generated from production by engineering/automation/schema-snapshot.mjs.\n-- Do not edit: change the database with a migration (ADR-001), then refresh.\n`;
const safe = (name) => String(name).replace(/[^A-Za-z0-9_.-]/g, '_');
const by = (key) => (a, b) => String(a[key]).localeCompare(String(b[key]));
const CMD = { r: 'select', a: 'insert', w: 'update', d: 'delete', '*': 'all' };
const who = (row, prefix) => ROLES.filter((r) => row[`${prefix}${r}`]).join(', ') || 'nobody but the owner';

// rows: { columns, tables, constraints, indexes, policies, triggers, functions, views }
// → { 'tables/x.sql': '...', ... }
export function buildFiles(rows) {
  const files = {};
  const group = (list, key) => list.reduce((m, r) => ((m[r[key]] ||= []).push(r), m), {});
  const cols = group(rows.columns, 'tbl');
  const cons = group(rows.constraints, 'tbl');
  const idx = group(rows.indexes, 'tbl');
  const pols = group(rows.policies, 'tbl');
  const trgs = group(rows.triggers, 'tbl');

  for (const t of [...rows.tables].sort(by('tbl'))) {
    const lines = [HEADER(`Table public.${t.tbl}`)];
    lines.push(`create table public.${t.tbl} (`);
    lines.push((cols[t.tbl] || []).sort((a, b) => a.pos - b.pos)
      .map((c) => `  ${c.col} ${c.type}${c.not_null ? ' not null' : ''}${c.dflt != null ? ` default ${c.dflt}` : ''}`).join(',\n'));
    lines.push(');');
    for (const k of (cons[t.tbl] || []).sort(by('name'))) lines.push(`alter table public.${t.tbl} add constraint ${k.name} ${k.def};`);
    for (const i of (idx[t.tbl] || []).sort(by('name'))) lines.push(`${i.def};`);
    lines.push('', `-- Row level security: ${t.rls ? 'on' : 'OFF'}${t.force_rls ? ' (forced)' : ''}`);
    for (const r of ROLES) lines.push(`-- ${r}: ${t[`grants_${r}`] || 'no access'}`);
    const p = (pols[t.tbl] || []).sort(by('name'));
    if (p.length) lines.push('', '-- Policies');
    for (const x of p) {
      lines.push(`create policy "${x.name}" on public.${t.tbl} as ${x.permissive ? 'permissive' : 'restrictive'} for ${CMD[x.cmd] || x.cmd} to ${x.roles}`
        + `${x.qual != null ? `\n  using (${x.qual})` : ''}${x.with_check != null ? `\n  with check (${x.with_check})` : ''};`);
    }
    const g = (trgs[t.tbl] || []).sort(by('name'));
    if (g.length) lines.push('', '-- Triggers (run in name order)');
    for (const x of g) lines.push(`${x.def};${x.enabled === 'D' ? ' -- DISABLED' : ''}`);
    files[`tables/${safe(t.tbl)}.sql`] = `${lines.join('\n')}\n`;
  }

  const fns = group(rows.functions, 'name');
  for (const name of Object.keys(fns).sort()) {
    const parts = fns[name].sort(by('args')).map((f) => `-- ${name}(${f.args}): execute: ${who(f, 'exec_')}\n${f.def.trim()};`);
    files[`functions/${safe(name)}.sql`] = `${HEADER(`Function public.${name}`)}\n${parts.join('\n\n')}\n`;
  }

  for (const v of [...rows.views].sort(by('name'))) {
    const kind = v.kind === 'm' ? 'materialized view' : 'view';
    files[`views/${safe(v.name)}.sql`] = `${HEADER(`${kind[0].toUpperCase()}${kind.slice(1)} public.${v.name}`)}`
      + `-- select: ${who(v, 'select_')}${v.options ? `\n-- options: ${v.options}` : ''}\n\n`
      + `create ${kind} public.${v.name}${v.options ? ` with (${v.options})` : ''} as\n${v.def.trim().replace(/;$/, '')};\n`;
  }

  const count = (dir) => Object.keys(files).filter((f) => f.startsWith(`${dir}/`)).length;
  files['README.md'] = `# Production schema snapshot

Generated from the production database by
\`engineering/automation/schema-snapshot.mjs\` (workflow *Schema snapshot*,
weekly and on demand). **Do not edit these files**: change the database with a
migration in \`trashdrop/supabase/migrations/\` (ADR-001), then refresh the
snapshot; the workflow opens a pull request when production changed.

| | Count |
|---|---|
| Tables (\`tables/\`: columns, constraints, indexes, row-level security, grants, policies, triggers) | ${count('tables')} |
| Functions (\`functions/\`: every overload, with who may execute it) | ${count('functions')} |
| Views (\`views/\`) | ${count('views')} |

Objects installed by extensions (PostGIS and others) are left out.
`;
  return files;
}

const DIRS = ['tables', 'functions', 'views'];

// The repository is public: a definition that looks like it carries a secret
// stops the snapshot, so it can be removed from the database first.
const SECRET = /(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|sb_secret_[A-Za-z0-9_-]{10,}|sk_(live|test)_[A-Za-z0-9]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
export function findSecrets(files) {
  return Object.entries(files).filter(([, content]) => SECRET.test(content)).map(([rel]) => rel);
}

export function writeFiles(files, out = OUT) {
  for (const d of DIRS) fs.rmSync(path.join(out, d), { recursive: true, force: true });
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(out, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
}

async function query(token, ref, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN; const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) { console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF.'); process.exit(2); }
  const rows = {};
  for (const [k, sql] of Object.entries(QUERIES)) rows[k] = await query(token, ref, sql);
  const files = buildFiles(rows);
  const leaky = findSecrets(files);
  if (leaky.length) {
    console.error(`Not written: ${leaky.length} definition(s) look like they contain a secret (${leaky.join(', ')}). Remove the secret from the database (a migration), rotate it, then refresh.`);
    process.exit(1);
  }
  writeFiles(files);
  console.log(`Wrote ${Object.keys(files).length} files to ${path.relative(process.cwd(), OUT)}`);
}

function selfTest() {
  const assert = (ok, what) => { if (!ok) { console.error(`self-test failed: ${what}`); process.exit(1); } };
  const rows = {
    columns: [
      { tbl: 'bins', col: 'fee', type: 'numeric', not_null: false, dflt: null, pos: 2 },
      { tbl: 'bins', col: 'id', type: 'uuid', not_null: true, dflt: 'gen_random_uuid()', pos: 1 },
    ],
    tables: [{ tbl: 'bins', rls: true, force_rls: false, grants_anon: null, grants_authenticated: 'SELECT,UPDATE', grants_service_role: 'DELETE,INSERT,SELECT,UPDATE' }],
    constraints: [{ tbl: 'bins', name: 'bins_pkey', def: 'PRIMARY KEY (id)' }],
    indexes: [{ tbl: 'bins', name: 'bins_fee_idx', def: 'CREATE INDEX bins_fee_idx ON public.bins USING btree (fee)' }],
    policies: [{ tbl: 'bins', name: 'own rows', cmd: 'w', permissive: true, roles: 'authenticated', qual: '(user_id = auth.uid())', with_check: null }],
    triggers: [{ tbl: 'bins', name: 'aa_guard', def: 'CREATE TRIGGER aa_guard BEFORE UPDATE ON public.bins FOR EACH ROW EXECUTE FUNCTION guard()', enabled: 'O' }],
    functions: [
      { name: 'guard', args: '', def: 'CREATE OR REPLACE FUNCTION public.guard()\n RETURNS trigger ...', exec_anon: false, exec_authenticated: false, exec_service_role: true },
      { name: 'price', args: 'p_size integer', def: 'CREATE OR REPLACE FUNCTION public.price(p_size integer) ...', exec_anon: true, exec_authenticated: true, exec_service_role: true },
      { name: 'price', args: '', def: 'CREATE OR REPLACE FUNCTION public.price() ...', exec_anon: false, exec_authenticated: true, exec_service_role: true },
    ],
    views: [{ name: 'my_bins', kind: 'v', def: ' SELECT id FROM bins;', options: 'security_invoker=true', select_anon: false, select_authenticated: true, select_service_role: true }],
  };
  const f = buildFiles(rows);
  assert(Object.keys(f).sort().join('|') === 'README.md|functions/guard.sql|functions/price.sql|tables/bins.sql|views/my_bins.sql', 'one file per object');
  const t = f['tables/bins.sql'];
  assert(t.indexOf('  id uuid not null default gen_random_uuid()') < t.indexOf('  fee numeric'), 'columns in table order');
  assert(t.includes('add constraint bins_pkey PRIMARY KEY (id);') && t.includes('CREATE INDEX bins_fee_idx'), 'constraints and indexes');
  assert(t.includes('-- Row level security: on') && t.includes('-- anon: no access') && t.includes('-- authenticated: SELECT,UPDATE'), 'RLS and grants');
  assert(t.includes('create policy "own rows" on public.bins as permissive for update to authenticated\n  using ((user_id = auth.uid()));'), 'policy');
  assert(t.includes('CREATE TRIGGER aa_guard'), 'trigger');
  const p = f['functions/price.sql'];
  assert(p.indexOf('-- price(): execute: authenticated, service_role') < p.indexOf('-- price(p_size integer): execute: anon, authenticated, service_role'), 'overloads sorted, with executors');
  assert(f['functions/guard.sql'].includes('execute: service_role'), 'executors');
  assert(f['views/my_bins.sql'].includes('create view public.my_bins with (security_invoker=true) as\nSELECT id FROM bins;'), 'view');
  assert(f['README.md'].includes('| 1 |') && f['README.md'].includes('| 2 |'), 'README counts');
  assert(Object.values(QUERIES).every((q) => /\bpublic\b/.test(q)), 'queries limited to the public schema');
  assert(/deptype = 'e'/.test(QUERIES.functions), 'extension objects left out');
  assert(findSecrets(f).length === 0, 'no secrets in clean definitions');
  assert(findSecrets({ 'functions/x.sql': "select 'sb_secret_abcdefghijklmnop'" })[0] === 'functions/x.sql', 'secret key found');
  assert(findSecrets({ 'functions/y.sql': "headers := '{\"Authorization\": \"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6.eyJyb2xlIjoic2VydmljZV9yb2xlIn0\"}'" }).length === 1, 'JWT found');
  assert(findSecrets({ 'functions/z.sql': "select 'whatsapp-guest@trashdrop.app'" }).length === 0, 'an email is not a secret');
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'schema-'));
  fs.mkdirSync(path.join(tmp, 'functions')); fs.writeFileSync(path.join(tmp, 'functions', 'gone.sql'), 'x');
  writeFiles(f, tmp);
  assert(!fs.existsSync(path.join(tmp, 'functions', 'gone.sql')) && fs.existsSync(path.join(tmp, 'tables', 'bins.sql')), 'dropped objects disappear on refresh');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('self-test passed');
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  if (process.argv.includes('--self-test')) selfTest();
  else main().catch((e) => { console.error(e.message); process.exit(1); });
}
