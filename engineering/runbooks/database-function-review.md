# Runbook: review and lock down database functions

**Who:** an engineer with the Supabase MCP or SQL editor, plus the CTO for the
go-ahead on production · **Time:** 30–60 minutes per group of functions ·
**Tracks:** tech-debt TD19, secure development principle 8

Use this to work through the functions the security advisor still flags
(`anon_security_definer_function_executable`), or any function you're
about to change. On 2026-11-11 six rounds of it took the functions that
signed-out visitors could run from 75 to 35.

## Why this matters

A `SECURITY DEFINER` function runs with its owner's rights and skips
row-level security. Postgres lets **everyone** execute a new function, and
Supabase grants `anon` (signed-out visitors) directly. So a function that
takes a user id and doesn't check the caller works for anyone: claim
someone's batch, read their dashboard, create pickups in their name.

Each function ends up in one of three states:

| State | Grants | Use when |
|---|---|---|
| **Server only** | `service_role` | No app calls it (server functions, triggers, jobs, or unused) |
| **Signed-in** | `authenticated`, `service_role` | Apps call it after sign-in and it isn't about one person's data |
| **Own account or staff** | signed-in, **and** `PERFORM public.td_assert_self_or_staff(<user id param>)` first | It takes a user or collector id |

Leave public (`anon`) only what is needed before sign-in, with a reason in
the migration: today `collector_phone_registered` (collector sign-up),
`team_invite_info` (invite links), `is_active_collector` (payment proxy),
the pricing lookups, and `check_dumping_duplicate`.

## Steps

### 1. List what's open

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
  (p.prosrc ~* '\m(insert|update|delete)\M') as writes,
  (p.prosrc ~* 'auth\.uid\(\)|auth\.role\(\)|td_can_manage|td_is_|td_my_role|td_assert') as checks_caller,
  p.prorettype = 'trigger'::regtype as is_trigger
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
where n.nspname = 'public' and p.prosecdef and d.objid is null and p.prokind = 'f'
  and has_function_privilege('anon', p.oid, 'execute')
order by is_trigger, writes desc, checks_caller, p.proname;
```

Trigger functions can't be called through the API: leave them for last.
Take a group of related functions (one feature, or one risk), writers
first, then reads of one person's data.

### 2. Find every caller

**In code**, all three repositories, apps and server functions:

```bash
f=function_name
grep -rn "['\"]$f['\"]" --include=*.js --include=*.jsx --include=*.ts \
  TrashDrop-Mobile-User-Domestic/trashdrop/src TrashDrop-Mobile-User-Domestic/trashdrop/netlify \
  trashdrop_management_webapp_admins/src trashdrop_management_webapp_admins/supabase/functions \
  trashdrop-mobile-collector-driver/src trashdrop-mobile-collector-driver/supabase/functions
```

For each caller, write down: which app, signed in or not (a public page,
sign-up and invite links run signed out), and which id it passes. Server
functions: check they use the secret key (`getServiceClient`), never the
publishable one.

**In the database** (other functions, scheduled jobs, views):

```sql
with targets(name) as (values ('function_a'), ('function_b')),
fns as (select p.proname, p.prosecdef, p.prosrc from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f' and p.prolang <> 13)
select t.name, f.proname as called_from, f.prosecdef from targets t
  join fns f on f.prosrc ~* ('\m' || t.name || '\s*\(') and f.proname <> t.name
union all select t.name, 'cron: ' || j.jobname, null from targets t join cron.job j on j.command ~* t.name;
```

A caller that is itself `SECURITY DEFINER` runs as the owner and isn't
affected by grants. A caller that **isn't** (for example a trigger function
without it) runs as the user: keep their access.

Don't touch the protected pricing and payout objects (CLAUDE.md in each
repository) without the owner's written approval.

### 3. Write the migration

In `trashdrop/supabase/migrations/`, one file per group. The header says
which functions, which state and why, and who calls them. Patterns from
2026-11-11 to copy:

- grants only: `20261111222807_writer_functions_signed_in_only.sql`
- own-account check added to live definitions: `20261111223556_writer_functions_own_account.sql`
- both: `20261111224255_personal_reads_own_account.sql`

`td_assert_self_or_staff(p_user)` lets through the secret key, the user
themselves, and admins and managers (`td_can_manage_requests()`); anyone
else gets error 42501. It only fits PL/pgSQL functions with one top-level
`BEGIN`; for a `LANGUAGE sql` function, make it server-only or rewrite it
in PL/pgSQL in its own reviewed change.

Revoke from `anon` by name (`REVOKE ALL ON FUNCTION … FROM PUBLIC, anon`):
revoking from `PUBLIC` alone leaves Supabase's direct grant to `anon`.

`node trashdrop/scripts/ci/check-migrations.js` must pass. CI runs it too.

### 4. Test on production, rolled back

Run the same statements inside one `DO` block that ends with
`RAISE EXCEPTION`, so nothing is kept, and report what you need to see:

```sql
DO $t$
DECLARE r text;
BEGIN
  -- the migration's statements here (EXECUTE for CREATE OR REPLACE / GRANT)
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    PERFORM public.some_function('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');  -- someone else
    r := 'ALLOWED (bad)';
  EXCEPTION WHEN insufficient_privilege THEN r := 'refused';
  END;
  RAISE EXCEPTION 'ROLLED BACK. other account: %', r;
END $t$;
```

Check: anon and authenticated privileges as planned
(`has_function_privilege`), another account refused, your own account
runs. Afterwards confirm production is unchanged.

The test sometimes finds existing bugs (three on 2026-11-11, TD37). Note
them; don't fix them in the same change.

### 5. Get the go-ahead, apply, verify

- The CTO approves applying to production.
- Apply with `apply_migration` (or the Database migrations workflow once
  staging exists). Rename the file to the version production records
  (`select version, name from supabase_migrations.schema_migrations order by version desc limit 1`).
- Verify: grants and checks as planned; no `permission denied for function`
  or `Not allowed for this account` in the logs; real traffic still `200`
  (the household dashboard polls every 30 seconds).
- Lower the `anon_security_definer_function_executable` ceiling in
  `engineering/automation/security-watch-config.json` to the advisor's new
  count, and add a probe for the most sensitive function in the group.

### 6. Record it

- Commit the migration and the security-watch change. **The repositories
  are public**: describe what changed, not how it could have been misused,
  until the fix is live (vulnerability management policy, rule 2).
- Update TD19 in the tech-debt register with the new count.
- What was exposed, from when to when, and any evidence of use (edge logs
  keep 24 hours: role and user per call) goes to the restricted incident
  file, not the repository.
