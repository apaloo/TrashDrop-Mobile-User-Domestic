# Archive

Moved here on 2026-11-11 so the repository root shows only what a new
engineer needs: `trashdrop/` (the app), `engineering/` (the handbook),
`docs/` and the CI configuration. **The code and
`trashdrop/supabase/migrations/` are the source of truth**; everything here
may be out of date.

| Folder | What it is |
|---|---|
| `notes/` | Implementation and fix notes written during development, plus the Q2 go-to-market strategy |
| `legacy-root/` | Files from an older copy of the app that lived at the repository root and was no longer built or deployed (`netlify.toml` builds `trashdrop/`) |
| `legacy-root/sql/` | One-off SQL fixes and checks. **Not migrations: never run them** |
| `legacy-root/migrations/` | An early migrations folder, superseded by `trashdrop/supabase/migrations/` |
| `legacy-root/supabase/` | A root-level copy of `gps_pricing_zones` that differs from the one in `trashdrop/` (kept for the schema baseline, runbook 05) |
| `legacy-root/scripts/` | One-off scripts, several of which ran SQL against the database directly. Reference only; do not run |
| `legacy-root/cypress/` | End-to-end specs that existed only in the root copy |

The 108 root files that were exact copies of files in `trashdrop/` were
deleted, not archived. Seven migrations that existed only in the root folder
and appear in production's migration history were moved into
`trashdrop/supabase/migrations/`.
