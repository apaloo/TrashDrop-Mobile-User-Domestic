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
| `security-watch.mjs` + `security-watch-config.json` | `security-watch.yml` (daily) | Outsider's-view probes of production and the Supabase security advisor |
| `production-smoke.mjs` + `production-smoke-config.json` | `production-smoke.yml` (hourly, and 7 minutes after each household deploy) | Each live site up, routed and with its key functions deployed; one issue while anything fails. `--self-test` checks the logic offline |

All scripts are idempotent: they look for an existing issue with the same
title (open or closed) before creating one. To change a recurring checklist,
edit the file in `../checklists/`; the next run uses it.
