# Runbook: a signed-out caller scanned the API

**Who:** whoever picks up the security-watch issue, with the Supabase MCP or
Logs Explorer · **Time:** 20–30 minutes · **Raised by:** the daily
[security watch](../../.github/workflows/security-watch.yml) ("Log scan")

## What it means

Every Supabase project has a public app key: it ships in each app's page,
so anyone can find it. Scanners use it to try many table and function
names in a short time, to see what answers. The security watch flags a
signed-out caller that, in one minute, touches more tables or functions than
real visitors ever do, or asks for many that don't exist. The limits and the
normal traffic they were measured against are in
`engineering/automation/security-watch-config.json` (`logScan`).

A scan is **P2** when every probe in the same run passed: someone looked,
and what we test for was not readable. Make it **P1**
([incident management](../policies/incident-management.md)) if step 3 or 4
finds data or a change.

## Steps

### 1. Read the run

Open the run linked from the issue. Check that every probe passed, and note
the minutes in the **Log scan** table. The table numbers callers instead of
naming them; IP addresses stay in Supabase, never in GitHub.

### 2. See what the caller asked for

In the Logs Explorer (or MCP `query_logs`), for each flagged minute:

```sql
select log_attributes['request.method'] as method,
  regexpExtract(log_attributes['request.path'], '^(/[^?]*)') as path,
  log_attributes['response.status_code'] as status, count() as n
from logs where source = 'edge_logs'
  and timestamp between '2026-01-01 00:00:00' and '2026-01-01 00:01:00'  -- the flagged minute
  and coalesce(nullIf(log_attributes['request.sb.jwt.authorization.payload.role'], ''), 'anon') = 'anon'
group by method, path, status order by status, n desc
```

`404` means the table doesn't exist. Note every path that answered `200`,
`201` or `204`, and any method other than `GET`.

### 3. Check that nothing readable came back

A `200` from a table can be an empty list: row-level security hides the
rows. For each table that answered `200`, count what a signed-out caller
sees (read-only; the role change ends with the transaction):

```sql
begin;
set local role anon;
select count(*) from public.<table>;
rollback;
```

Every count should be `0`. Any other number means signed-out visitors can
read that table: **P1**. Fix its policies before anything else.

### 4. Check for writes and function calls

Any `POST`, `PATCH` or `DELETE`, any `/rest/v1/rpc/` call that answered `200`,
and any `/storage/` or `/auth/` request from the caller needs a closer look.
Check those functions against
[ADR-002](../decisions/ADR-002-database-function-access.md): a function a
signed-out caller could run successfully should be in the documented
pre-sign-in list.

### 5. Record and close

- **Restricted incident file, not the repository:** the time, the caller's
  address and browser, what was asked for, and what answered. The
  repositories are public
  ([vulnerability management](../policies/vulnerability-management.md), rule 2).
- **Security-watch issue:** a neutral comment ("Scan at HH:MM UTC; nothing
  private readable; checked per runbook"), then close it.
- **If a probe should have caught what you found:** add one to
  `security-watch-config.json` in the fix's pull request.
- **No blocking step:** Supabase doesn't block API callers by address.
  The protection is row-level security and function grants, so the fix for a
  real finding is always in the database.

The next day's run checks the 24 hours before it, so a scan is reported
once.
