# Automation scripts

Run by GitHub Actions through `actions/github-script`; plain CommonJS, no dependencies.

| File | Run by | Purpose |
|---|---|---|
| `labels.js` | bootstrap, cadence | The label set used by issue forms and the Projects board |
| `setup-issues.js` | bootstrap | One issue per setup step. Keep in step with `../setup-tracker.md` |
| `bootstrap.js` | `engineering-bootstrap.yml` (manual) | Creates/updates labels; opens setup issues not yet opened |
| `cadence.js` | `governance-cadence.yml` (1st of month) | Opens recurring governance issues from `../checklists/` |
| `monthly-report.js` | cadence | Drafts the monthly CTO report from pull requests, reviews, CI runs and issues (all three repositories with `ENGINEERING_REPORT_TOKEN`) |
| `repo-health.js` | cadence | Monthly, per repository: standard files present, `main` protected, private, known-failing tests, pull requests open 14+ days, branches to delete |
| `branch-cleanup.js` | repo-health | Finds merged and 60-day-idle branches |
| `release-notes.js` | `release-notes.yml` | GitHub Release per production deploy, listing the pull requests shipped |
| `error-watch.mjs` + `error-watch-config.json` | `error-watch.yml` (daily) | Database errors in the last 24 hours by type; flags new or growing ones (`--self-test` runs without network) |
| `supabase-public.mjs` + `supabase-public.json` | every watch | The production project's public settings (URL, project ref, publishable key), used when the repository variables are unset; never on pull requests, never for secrets |
| `supabase-logs.mjs` | security watch, error watch | Reads production logs through the Supabase Management API |
| `security-watch.mjs` + `security-watch-config.json` | `security-watch.yml` (daily) | Outsider's-view probes of production, the Supabase security advisor, a scan check on the last 24 hours of API logs, protected-object fingerprints, the migration ledger, caller checks skipped when signed out, and money or points writes (`--self-test` runs without network) |
| `schema-snapshot.mjs` | `schema-snapshot.yml` (Mondays, and on demand) | Writes the live production schema into `trashdrop/supabase/schema/`, one file per table, function and view, and opens a pull request when it changed (TD18, ADR-001). Refuses to write a definition that looks like it holds a secret (`--self-test` runs without network) |
| `history-secret-scan.mjs` + `history-secret-scan-baseline.json` | `history-secret-scan.yml` (Tuesdays, and on demand) | Every commit of all three repositories scanned with gitleaks (`.gitleaks.toml`, including a Meta access token rule). Reviewed findings are listed by one-way hash only, so the public repository never says where an old secret is; fails on any new finding and reports secrets still waiting to be revoked (runbook `../runbooks/secret-in-git-history.md`; `--self-test` runs offline) |
| `operations-watch.mjs` + `operations-watch-config.json` | `operations-watch.yml` (Mondays, and on demand) | Pickups, digital bins and dumping reports waiting longer than their limit (since created, or since their last change), counts and ages only. Keeps one issue for operations with the change since last week; reports, never fails the build (`--self-test` runs offline) |
| `production-smoke.mjs` + `production-smoke-config.json` | `production-smoke.yml` (hourly, and 7 minutes after each household deploy) | Each live site up, routed and with its key functions deployed; one issue while anything fails. `--self-test` checks the logic offline |

All scripts are idempotent: they look for an existing issue with the same
title (open or closed) before creating one. To change a recurring checklist,
edit the file in `../checklists/`; the next run uses it.
