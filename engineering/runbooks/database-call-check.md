# The database call check failed

**Check:** `scripts/ci/check-rpc-calls.mjs`, run by CI in all three apps
(household: `trashdrop/scripts/ci/`; collector and admin: `scripts/ci/`). The
script and its snapshot, `rpc-signatures.json`, are the same file in all
three; the household copy is the source (`engineering/automation/shared-scripts.mjs`
compares them daily).

It compares what the app asks of the production database with what
production has, because unit tests mock the database and so cannot see these
mistakes:

| What the code does | What must be true |
|---|---|
| `supabase.rpc('name', { … })` | the function exists, takes those parameter names and gets every required one |
| `supabase.from('name')` | the table or view exists |
| after `from()`: `insert` / `update` / `upsert` keys, the column of `eq`, `neq`, `in`, `is`, `like`, `order` and the like, plain names in `select('…')` | each column exists (only names written out literally are checked) |
| `supabase.storage.from(bucket)` | the bucket exists, and `getPublicUrl()` is used only on a public bucket |

Each of these failed in production before it was checked: functions called
with the wrong names for weeks (TD37, TD38), shifts saved to a table that never
existed (TD66), redemptions logged with columns the table lacks (TD68), public
links to private photos (TD70).

## Reading the failure

The CI log shows one line per problem, for example:

```
::error file=src/pages/Rewards.js,line=370::user_activity.points: column does not exist (insert)
```

## What to do

1. **The code is wrong** (a typo, a column that was renamed, a table that was
   never created): fix the code. This is the usual case.
2. **The pull request also creates what the code uses:** put the migration in
   the household repository's `trashdrop/supabase/migrations/` (ADR-001), named
   with today's date or later. The check counts functions from every
   migration, and tables, views and changed columns from migrations dated on
   or after the snapshot, so the pull request passes. In the collector or admin
   repository, link the household pull request.
3. **Production changed after the snapshot** (a function or column added by an
   applied migration): refresh the snapshot in the household repository and
   copy it to the other two in the same day:

   ```bash
   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=tfdedlqdsajjdjkerkli node trashdrop/scripts/ci/check-rpc-calls.mjs --refresh
   ```

   The Monday *Schema snapshot* workflow does this by itself once the
   `SUPABASE_ACCESS_TOKEN` secret is set (setup step 07b), in the same pull
   request as the schema files. Never edit the snapshot by hand to make a call
   pass.
4. **A problem that already exists and needs a decision before it can be
   fixed** (protected pricing, points or payout code, or code waiting for
   removal): record it in `engineering/registers/tech-debt.md`, then add it to
   `scripts/ci/rpc-known-problems.json` with that item:

   ```json
   { "file": "src/pages/Rewards.js", "table": "user_activity", "column": "points", "ref": "TD68" }
   ```

   Use `"function"` for an rpc() call, `"table"` (and `"column"`) for a table,
   `"bucket"` for storage. Only problems that are already in production go
   here, never a new mistake. When it is fixed, CI fails until the entry is
   deleted, so the list cannot go stale.

## What it cannot see

- Names built at run time (`from(tableName)`, `rpc(name)`, a column in a
  variable, a spread `{ ...row }`): not checked.
- Row-level security: whether this user may read or write the row. A write the
  database refuses to every signed-in user is reviewed by hand (2026-11-13: the
  only one was `rewardsService`'s delete from `reward_redemptions`, dead code,
  TD63).
- Netlify and Supabase functions are checked for names, but they may run with
  the service key, which bypasses row-level security.
