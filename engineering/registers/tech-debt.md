# Technical debt register

**Owner:** Technical Lead · **Reviewed:** every sprint planning

Each item becomes an issue labelled `tech-debt` when someone picks it up.
"Now" = this quarter.

| ID | Item | Repo | When | Notes |
|---|---|---|---|---|
| TD1 | Fix the 8 known-failing test suites | household | Now | `trashdrop/scripts/ci/known-failing-tests.txt` |
| TD2 | Lint the test files too (92 jest-rule errors) | household | Now | Then drop the `--ignore-pattern`s in `npm run lint` |
| TD3 | Move carter payout calculation fully server-side, with guard tests and a written spec like `DIGITAL_BIN_PRICING.md` | carter + DB | Now | Needs owner's written approval |
| TD4 | ~~Remove the dead app copy at the household repository root (`/netlify`, `/cypress`, `/migrations`, `/temp_edits`, root `package.json`, about 40 root `*_FIX.md`, root `.sql` files)~~ | household | Done | Done 2026-11-11: root copy removed (108 duplicates deleted; notes, SQL and scripts archived in docs/archive/; 7 production-recorded migrations moved into trashdrop/supabase/migrations) |
| TD5 | ~~Remove committed dev files: `localhost*.pem`, `dev-server.log`, `*.bak*`, `*.orig`, `.DS_Store`, `.netlify/state.json`~~ | household | Done | Done 2026-11-11: files removed, .gitignore covers them, .pem allowlist dropped from .gitleaks.toml |
| TD6 | ~~Remove debug routes from production builds (`/schema-test`, `/toast-test`, `/network-test`)~~ | household | Done | Done 2026-11-11: routes exist only in development builds |
| TD7 | Add caller authentication to `check-batch` | household | Now | Used by `batchService.js` |
| TD8 | Consolidate three service-worker files into one | household | Next | |
| TD9 | One map stack (Leaflet + OSM), Google only where needed | carter, household | Next | Cost and complexity |
| TD10 | Replace the hard-coded admin email list with a role table | admin + DB | Next | Adding an admin shouldn't need a migration |
| TD11 | Make `npm audit` blocking for critical runtime findings | all | Next | After Dependabot backlog |
| TD12 | Move CRA apps to Vite; Node 20 on every build | household, admin | Phase 4 | Also clears most of TD32 |
| TD13 | Introduce TypeScript gradually (new files first) | all | Phase 4 | |
| TD14 | Move the public website out of the admin repository | admin | Phase 4 | |
| TD15 | Move large binaries (PSD, posters) out of git to Google Drive | admin | Next | Unused PSD and PNG removed in admin #109; save the PSD to the shared drive |
| TD31 | Compress the large site photos in the admin portal (`auth-bg.jpg` and `gradient-background.jpg` 6.4 MB each and identical, `cargo-bike.jpg` 5.6 MB) | admin | Next | Page-load speed on mobile data |
| TD32 | Remaining npm audit findings after the 2026-11-11 non-breaking fixes (production dependencies): household 13 high, admin 13 high, carter 1 high. Nearly all come from `react-scripts` (webpack-dev-server, svgo, postcss 7) and carter's `vite-plugin-pwa`; build-time only, not shipped to browsers | all | Next | Cleared by TD12 (move off Create React App) and a `vite-plugin-pwa` major upgrade; then do TD11 |
| TD16 | Delete stale branches (26 in carter, 20+ in admin) | carter, admin | Now | The monthly branch clean-up issue lists them in the household repository; roll the cadence out to the other repositories with the other automation |
| TD17 | Household card/bank payment screen is a placeholder | household | Product decision | Remove it or integrate MoMo properly |
| TD18 | One owner for the shared schema; migrations consolidated | all | Now | ADR, runbook 05 §6 |
| TD19 | Database security stage 2: restrict `get_user_*`, `user_stats_dashboard` and staff functions to owner/staff; set `security_invoker` on the 12 SECURITY DEFINER views; add caller checks to SECURITY DEFINER functions (about 79 had none on 2026-11-11); fix `search_path` on 150 functions | DB | Now | Supabase security advisor; test on staging |
| TD20 | Database performance advisor: 59 RLS policies re-evaluating `auth.uid()` per row, 45 unindexed foreign keys, 43 overlapping permissive policies, 4 duplicate indexes, 17 tables without a primary key | DB | Next | Supabase performance advisor |
| TD21 | Delete 9 leftover `*_backup_2026*` tables in `public` after confirming they are not needed | DB | Next | Backups belong in backups, not in the live schema |
| TD22 | ~~Turn on leaked-password protection~~ (done 2026-11-11). **Upgrade Postgres** from 15.8.1.105: the blocker (`pgjwt`) was dropped on 2026-11-11, so the owner can start the upgrade (Settings → General → Service versions). Production is offline during it, so schedule a quiet window and announce it | DB | Now | Owner action |
| TD23 | Unused Supabase project "TrashDrop Admin WebPortal": **exported** 2026-11-11 (owner holds the JSON: mostly seed/test data, 11 auth users). Cannot be paused while in the paid organisation. Owner decision: delete it, or move it to a free organisation and pause it | DB | Now | Owner action |
| TD24 | Carter app: calls to functions that don't exist (`NavigationQRModal.jsx`, `AssignmentNavigationModal.jsx`, `Map.jsx`, `routeCache.js`, `requestManagement.js`, `analytics.js`). Fix in review: carter #52 | carter | Now | The arrival-zoom and storage-full ones ran in production; regression tests added |
| TD25 | Carter app: hook called in a click handler (`OfflineIndicator.jsx` Sync Now, which threw); `OSMNavigationMap.jsx` helper misnamed as a hook. Fix in review: carter #52 | carter | Now | |
| TD26 | Lint backlogs: carter 250 errors, admin 46 (src). CI lints changed files only; bring both to 0, then lint everything | carter, admin | Next | Job summary shows the count on every run |
| TD27 | Rotate the Google Maps API key that was committed to the carter repository, and restrict it to the app domains | carter | Now | Owner action in Google Cloud; key removed from files in carter #46 |
| TD28 | ~~Carter photo storage access and payment-function authentication~~: done 2026-11-11 (carter #47, #48) | carter, DB | Done | Details in the restricted incident file |
| TD29 | Admin build runs on Node 16 (end of life) on Netlify; CI uses Node 20 | admin | Next | Set `NODE_VERSION = "20"` in netlify.toml after checking the pre-render step |
| TD30 | Delete the legacy `backend_webhooks/` Express server in the carter repository (replaced by Edge Functions) | carter | Next | Excluded from lint |
