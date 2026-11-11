# ADR-002: Who may call a database function

**Status:** Accepted (applied to production 2026-11-11, with the owner's approval for each migration) · **Date:** 2026-11-11 · **Deciders:** CTO, owner

## Context

The apps do much of their work through Postgres functions called over the
Supabase API (`supabase.rpc(...)`). Many of them are `SECURITY DEFINER`:
they run with their owner's rights and skip row-level security, which is
how they reach rows the caller can't see directly (an unclaimed batch, a
collector's earnings, a pickup's coordinates).

Two defaults made that dangerous:

- Postgres lets **everyone** execute a new function, and Supabase also
  grants `anon` (signed-out visitors, using the public app key) directly.
- Most of these functions take a user or collector id as a parameter and
  trust it.

On 2026-11-11, 75 such functions could be run by signed-out visitors,
including ones that write data for any account and ones that return one
person's data for any id. Row-level security on the tables didn't help,
because these functions bypass it.

## Options considered

| Option | For | Against |
|---|---|---|
| A. Keep functions, fix grants and add caller checks in the database | No app rewrites; every app keeps calling the same functions; enforced at the one place all three apps share | Each function must be reviewed for its callers; checks are per function |
| B. Replace definer functions with `SECURITY INVOKER` and rely on row-level security | One mechanism (RLS) for everything | Many functions exist precisely to reach rows RLS hides (unclaimed batches, earnings); large rewrite of SQL and app code across three repositories |
| C. Move these operations into server functions (Netlify, Edge) with the secret key | Caller checks in application code, testable in CI | Most work moves out of the database; more endpoints to secure and deploy; doesn't fix the existing functions until each is moved |

## Decision

**Option A.** Every `SECURITY DEFINER` function in `public` is in exactly one
of three states:

| State | Grants | When |
|---|---|---|
| **Server only** | `service_role` | No app calls it: server functions with the secret key, triggers, scheduled jobs, or unused |
| **Signed-in** | `authenticated`, `service_role` | Apps call it after sign-in and it isn't about one person's data |
| **Own account or staff** | signed-in, and the body starts with `PERFORM public.td_assert_self_or_staff(<user id parameter>)` | It takes a user or collector id |

`td_assert_self_or_staff(p_user)` lets through the secret key, the user
themselves (`auth.uid()`), and admins and managers
(`td_can_manage_requests()`). Anyone else gets error `42501`.

A function stays callable by `anon` only when something legitimately calls
it before sign-in (collector sign-up's phone check, team invite links,
public pricing lookups), and its migration says so.

Every such function also fixes its `search_path`.

## Consequences

- **Enforced for new work:** `trashdrop/scripts/ci/check-migrations.js`
  fails CI when a migration from 2026-11-11 on creates a definer function
  without a fixed `search_path`, or (unless it is a trigger function)
  without a caller check or a `REVOKE … FROM anon`. Secure development
  policy, principle 8.
- **Watched in production:** the daily security watch fails if the
  advisor's count of functions anyone can run rises above its ceiling
  (35 after 2026-11-11), and probes P11–P17 check the most sensitive ones.
- **Remaining work:** 35 functions still open to signed-out callers (mostly
  triggers and deliberate public lookups), and 18 functions defined in older
  migrations that break these rules. The team works through them with the
  [database function review runbook](../runbooks/database-function-review.md),
  tracked as TD19.
- **Staff access is coarse:** "staff" means admin or manager. If authorities
  or other roles need to act on another account, add a narrower check
  rather than widening `td_assert_self_or_staff`.
- **Cost:** a function that takes a user id now rejects calls for other
  accounts. Any new feature that needs that (for example an admin acting
  for a household) must call through a staff role or a server function.
- **Migrations applied:** `20261111222005`, `20261111222807`,
  `20261111223556`, `20261111224255`, `20261111225535` in
  `trashdrop/supabase/migrations/`.
