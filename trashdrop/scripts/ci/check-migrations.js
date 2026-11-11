#!/usr/bin/env node
/*
 * Database migration checks (secure development policy, principle 8).
 *
 * Every function a migration creates with SECURITY DEFINER runs with its
 * owner's rights, so it must:
 *   1. fix its search_path (SET search_path = ...), and
 *   2. unless it is a trigger function (RETURNS trigger: not callable through
 *      the API), either check its caller in its body (auth.uid(),
 *      auth.role(), td_assert_self_or_staff, td_can_manage_requests,
 *      td_is_*, td_my_role) or be revoked from anon in the same file
 *      (REVOKE ... ON FUNCTION <name> ... FROM ... anon).
 *
 * Migrations before FIRST_CHECKED were written before this rule and are
 * tracked in the tech-debt register (TD19), not here.
 *
 *   node scripts/ci/check-migrations.js              check supabase/migrations
 *   node scripts/ci/check-migrations.js --self-test  check the rules themselves
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const FIRST_CHECKED = '20261111222005';
const MIGRATIONS = path.join(__dirname, '..', '..', 'supabase', 'migrations');
const CALLER_CHECK = /auth\.uid\(\)|auth\.role\(\)|td_assert_self_or_staff|td_can_manage_requests|td_is_\w+\(|td_my_role\(/i;

/** Functions created in a migration: name, header (before the body), body */
function functionsIn(sql) {
  const out = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    const start = m.index;
    const asMatch = /\bas\s+(\$[\w]*\$)/i.exec(sql.slice(start));
    if (!asMatch) continue;
    const headerEnd = start + asMatch.index;
    const tag = asMatch[1];
    const bodyStart = headerEnd + asMatch[0].length;
    const bodyEnd = sql.indexOf(tag, bodyStart);
    if (bodyEnd < 0) continue;
    out.push({
      name: m[1].replace(/"/g, '').replace(/^public\./i, ''),
      header: sql.slice(start, headerEnd),
      body: sql.slice(bodyStart, bodyEnd),
    });
    re.lastIndex = bodyEnd + tag.length;
  }
  return out;
}

/** Problems with one migration's SQL, as readable strings */
function problemsIn(sql) {
  const problems = [];
  for (const fn of functionsIn(sql)) {
    if (!/security\s+definer/i.test(fn.header)) continue;
    if (!/set\s+search_path/i.test(fn.header)) {
      problems.push(`${fn.name}: SECURITY DEFINER without SET search_path`);
    }
    if (/returns\s+trigger/i.test(fn.header)) continue;
    const revoked = new RegExp(`revoke[^;]*on\\s+function\\s+(public\\.)?"?${fn.name}"?\\s*\\([^;]*from[^;]*\\banon\\b`, 'i').test(sql);
    if (!revoked && !CALLER_CHECK.test(fn.body)) {
      problems.push(`${fn.name}: SECURITY DEFINER that neither checks its caller nor is revoked from anon`);
    }
  }
  return problems;
}

function selfTest() {
  const good = `CREATE OR REPLACE FUNCTION public.f(p uuid) RETURNS json LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public, pg_temp AS $function$ BEGIN PERFORM public.td_assert_self_or_staff(p); RETURN '{}'; END; $function$;`;
  const revoked = `CREATE FUNCTION g() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ select 1 $$;
    REVOKE ALL ON FUNCTION public.g() FROM PUBLIC, anon;`;
  const trigger = `CREATE FUNCTION t() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN RETURN NEW; END $$;`;
  const invoker = `CREATE FUNCTION h() RETURNS int LANGUAGE sql AS $$ select 1 $$;`;
  assert.deepStrictEqual(problemsIn(good), []);
  assert.deepStrictEqual(problemsIn(revoked), []);
  assert.deepStrictEqual(problemsIn(trigger), []);
  assert.deepStrictEqual(problemsIn(invoker), []);

  const noPath = good.replace(/SET search_path = public, pg_temp/, '');
  assert.match(problemsIn(noPath)[0], /without SET search_path/);
  const open = `CREATE FUNCTION public.k(p uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN DELETE FROM x WHERE id = p; END $$;`;
  assert.match(problemsIn(open)[0], /neither checks its caller nor is revoked from anon/);
  // Revoking from PUBLIC alone is not enough: Supabase grants anon directly
  assert.strictEqual(problemsIn(open + ' REVOKE ALL ON FUNCTION public.k(uuid) FROM PUBLIC;').length, 1);
  assert.deepStrictEqual(problemsIn(open + ' REVOKE ALL ON FUNCTION public.k(uuid) FROM PUBLIC, anon;'), []);
  // A revoke for another function doesn't count
  assert.strictEqual(problemsIn(open + ' REVOKE ALL ON FUNCTION public.kk(uuid) FROM anon;').length, 1);
  console.log('self-test passed');
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const files = fs.readdirSync(MIGRATIONS)
    .filter((f) => /^\d{14}_.*\.sql$/.test(f) && f.slice(0, 14) >= FIRST_CHECKED)
    .sort();
  let failed = 0;
  for (const f of files) {
    const problems = problemsIn(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
    for (const p of problems) {
      failed += 1;
      console.log(`::error file=trashdrop/supabase/migrations/${f}::${p}`);
    }
  }
  console.log(failed
    ? `${failed} problem(s) in ${files.length} migration(s) checked. See engineering/policies/secure-development.md, principle 8.`
    : `${files.length} migration(s) checked (from ${FIRST_CHECKED}): no problems.`);
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main();
module.exports = { problemsIn, functionsIn, FIRST_CHECKED };
