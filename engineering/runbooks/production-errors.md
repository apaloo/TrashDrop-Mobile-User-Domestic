# Runbook: production database errors

**Who:** whoever picks up the error-watch issue, with the Supabase MCP or
Logs Explorer · **Time:** 30–90 minutes · **Raised by:** the daily
[error watch](../../.github/workflows/error-watch.yml)

## What it means

The error watch groups the last 24 hours of Postgres errors by type, with
values, ids and numbers removed, and flags:
- any type seen 5 or more times;
- missing columns or functions, wrong types and ambiguous operators from
  the first one (code and database out of step is always a bug);
- higher limits only for what ordinary traffic produces (permission denied,
  missing tables from scanners).

Accepted types are listed in `engineering/automation/error-watch-config.json`
(`known`), each with its register item and the date its acceptance ends.

Every bug fixed on 2026-11-12 looked like this first: the collector app's
location updates failing on every call (TD38), the dashboard's live
updates refused 3,000 times a day (TD43), the expired-assignment release
refused every minute (TD41). Most were hidden by a fallback in the app.

## Steps

### 1. Find the failing request

In the Logs Explorer (or MCP `query_logs`), get the full message, the SQL
and its context for the flagged type:

```sql
select timestamp, event_message,
  log_attributes['parsed.context'] as context,
  substring(log_attributes['parsed.query'], 1, 800) as query
from logs where source = 'postgres_logs'
  and event_message like '%<a distinctive part of the message>%'
order by timestamp desc limit 5
```

- `context` names the function or trigger that raised it (for example
  `PL/pgSQL function enforce_pickup_status_flow() line 51`).
- `query` starting `WITH pgrst_source AS` came through the API from an
  app; its table and columns tell you which call it is.
- `realtime.subscription_check_filters()` means a Realtime subscription in
  an app has a bad filter.

### 2. Find the caller and its effect

- **Which app:** match the same minute in `edge_logs` (path, method, status
  and `request.headers.referer`).
- **Which code:** search all three repositories for the table, function or
  filter (the database function review runbook has the grep).
- **What the user sees:** many callers fall back or swallow the error.
  Check what the fallback does, and whether it works. On 2026-11-12 the
  location fallback failed too, so no position was saved for 30 hours.

### 3. Reproduce it, rolled back

Run the failing statement as the same role inside a `DO` block that ends
with `RAISE EXCEPTION 'ROLLED BACK. …'`
([database function review](database-function-review.md), step 4). Start the
message with `ROLLED BACK` so the error watch doesn't count your test.

### 4. Fix it where it belongs

- **Database:** a new migration, tested rolled back first, applied only
  with the CTO's go-ahead.
- **App:** a pull request with a test that fails on the old code.
- **Protected pricing or payouts:** owner's written approval (CLAUDE.md).

### 5. Record and close

- **Register:** add or update the item in `engineering/registers/tech-debt.md`.
- **Accepting an error instead of fixing it** needs the CTO's review: add it
  to `known` with its register item, a daily `max` and an `until` date.
- **Old builds:** if a fix is live but old builds still produce the error
  (an open tab or preview), add it to `known` for a week, with the reason.
- **The issue:** it closes on the first run that finds nothing. The window
  is 24 hours, so allow a day after the fix.
