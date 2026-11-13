# Runbook: review and lock down database functions

**Who:** an engineer with the Supabase MCP or SQL editor, plus the CTO for the
go-ahead on production · **Time:** 30–60 minutes per group of functions ·
**Tracks:** tech-debt TD19, secure development principle 8 · **Decision:** [ADR-002](../decisions/ADR-002-database-function-access.md)

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
`RAISE EXCEPTION`, so nothing is kept, and report what you need to see.
Start the message with `ROLLED BACK` so the daily error watch doesn't count
your test:

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

## Write policies open to every row

The daily security watch counts row-level security write policies (INSERT,
UPDATE, DELETE or ALL) that apply to every row or to signed-out visitors,
and fails when the count rises above `writePolicies.maxOpen` in
`engineering/automation/security-watch-config.json`. It publishes the count
only. To see which ones (Supabase SQL editor or MCP; keep the result out of
GitHub, the repository is public):

```sql
select c.relname as table_name, p.polname, p.polcmd,
       array(select rolname from pg_roles where oid = any(p.polroles)) as roles,
       pg_get_expr(p.polqual, p.polrelid) as using_rule,
       pg_get_expr(p.polwithcheck, p.polrelid) as check_rule
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and p.polcmd in ('a', 'w', 'd', '*')
  and p.polroles <> array[(select oid from pg_roles where rolname = 'service_role')]
  and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') = 'true'
    or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') = 'true'
    or exists (select 1 from pg_roles r where r.oid = any(p.polroles) and r.rolname = 'anon'))
order by 1, 2;
```

For each one: find who writes to the table (all three repositories and the
Edge and Netlify functions), restrict the policy to the owner, the assigned
collector or staff, or move the write into a SECURITY DEFINER function. Test
it rolled back as a signed-in user (step 4), apply it with the CTO's
go-ahead, then lower `maxOpen`.


## Functions a signed-in user can run without a caller check

The security watch counts these daily (`uncheckedFunctions` in
`security-watch-config.json`; baseline 0 that write, 2 that read personal
data, 2026-11-12). When the count rises, list them here, privately (SQL editor,
never in an issue or pull request until fixed):

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.prosecdef and p.prorettype <> 'trigger'::regtype
  and has_function_privilege('authenticated', p.oid, 'execute')
  and not (p.prosrc ~* 'auth\.uid\(\)|auth\.role\(\)|td_assert_self_or_staff|td_can_manage_requests|td_is_staff|td_is_active_collector|td_my_collector|can_do\(|td_my_team|td_area_report_for')
  and ((pg_get_function_identity_arguments(p.oid) ~* 'uuid|_id' and p.prosrc ~* '\m(insert\s+into|update\s+\w|delete\s+from)')
       or p.prosrc ~* 'auth\.users|\mphone\M')
order by 1;
```

Then, for each one: find its callers in all three apps and in the API logs
(`/rest/v1/rpc/<name>` in the edge logs). Unused: make it server-only
(`REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated; GRANT ... TO
service_role`). Used: add a check of who is calling (`td_assert_self_or_staff`,
`td_can_manage_requests()`, `can_do('<capability>')`), test it rolled back as a
household user, a collector and staff, and apply it in a migration.

## Personal data open to signed-out callers

The security watch counts these daily (`personalExposure`, baseline 0 since
2026-11-12). When the count rises, list them privately:

```sql
select c.relname, c.relkind
from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where has_table_privilege('anon', c.oid, 'select')
  and ((c.relkind = 'r' and not c.relrowsecurity) or c.relkind = 'm'
       or (c.relkind = 'v' and not coalesce(c.reloptions::text[] && array['security_invoker=true', 'security_invoker=on'], false)))
  and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
              and a.attname ~* '^(email|phone|phone_number|first_name|last_name|client_momo|momo_number|address)$');
```

Then revoke `SELECT` from `anon` (and `authenticated` if the app doesn't need
it), switch on row-level security for a table, or make a view run as the
caller (`security_invoker`), after checking its readers in all three apps and
the API logs.

## Access control

The functions and row-level policies that decide what an account can see and
do are fingerprinted by the daily security watch (`accessDefinitions` in
`engineering/automation/security-watch-config.json`): account roles and areas
(`request_account_role`, `admin_review_account_role`, `admin_set_account_area`,
`my_access`), volunteer teams (`team_*`, `td_team_of`, `td_my_team`,
`td_effective_account`), who someone is (`td_my_role`, `td_is_staff`,
`td_my_area`, `td_in_my_area`, `td_my_assign_region`), capabilities (`can_do`,
`has_any_role`, `td_capability_roles`, which the admin site owns) and the
policies on `account_roles`, `staff_admins`, `team_members`, `team_invites` and
`illegal_dumping_mobile`.

Why: a flaw here is in the logic, not a missing check. On 2026-11-13 (TD61)
`request_account_role` checked who was calling but still let an approved
account move itself to another district. The "caller check" count can't see
that; a fingerprint notices any change.

When the watch reports a change:

1. Find the pull request and migration that made it. None: treat it as an
   incident (someone changed access in the dashboard) and restore the migration's
   definition.
2. Review the new definition with one question per input: **can a signed-in
   account use this to give itself, or another account, more access, or a
   different area, without an admin?** Test the answer as that account in a
   rolled-back transaction (section 4 above shows how to act as a user).
3. Record the new fingerprint: run `ACCESS_DEFINITIONS_SQL` from
   `security-watch.mjs` on production and copy the changed hash into
   `accessDefinitions.objects`, in the same pull request or a follow-up that
   links the review. Never record a fingerprint only to make the watch pass.

Adding an object: add it to `ACCESS_FUNCTIONS` or `ACCESS_TABLES` and record its
fingerprint; the self-test fails until both are there.
