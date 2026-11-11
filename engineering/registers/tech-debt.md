# Technical debt register

**Owner:** Technical Lead · **Reviewed:** every sprint planning

Each item becomes an issue labelled `tech-debt` when someone picks it up.
"Now" = this quarter.

| ID | Item | Repo | When | Notes |
|---|---|---|---|---|
| TD1 | Fix the 8 known-failing test suites | household | Now | `trashdrop/scripts/ci/known-failing-tests.txt` |
| TD2 | Lint the test files too (92 jest-rule errors) | household | Now | Then drop the `--ignore-pattern`s in `npm run lint` |
| TD3 | Move carter payout calculation fully server-side, with guard tests and a written spec like `DIGITAL_BIN_PRICING.md` | carter + DB | Now | Needs owner's written approval |
| TD4 | Remove the dead app copy at the household repository root (`/netlify`, `/cypress`, `/migrations`, `/temp_edits`, root `package.json`, about 40 root `*_FIX.md`, root `.sql` files) | household | Now | Root `netlify.toml` must stay (`base = trashdrop`) |
| TD5 | Remove committed dev files: `localhost*.pem`, `dev-server.log`, `*.bak*`, `*.orig`, `.DS_Store`, `.netlify/state.json` | household | Now | Then drop the `.pem` allowlist in `.gitleaks.toml` |
| TD6 | Remove debug routes from production builds (`/schema-test`, `/toast-test`, `/network-test`) | household | Now | |
| TD7 | Add caller authentication to `check-batch` | household | Now | Used by `batchService.js` |
| TD8 | Consolidate three service-worker files into one | household | Next | |
| TD9 | One map stack (Leaflet + OSM), Google only where needed | carter, household | Next | Cost and complexity |
| TD10 | Replace the hard-coded admin email list with a role table | admin + DB | Next | Adding an admin shouldn't need a migration |
| TD11 | Make `npm audit` blocking for critical runtime findings | all | Next | After Dependabot backlog |
| TD12 | Move CRA apps to Vite; Node 20 on every build | household, admin | Phase 4 | |
| TD13 | Introduce TypeScript gradually (new files first) | all | Phase 4 | |
| TD14 | Move the public website out of the admin repository | admin | Phase 4 | |
| TD15 | Move large binaries (PSD, posters) out of git to Google Drive | admin | Next | 17.8 MB PSD served publicly |
| TD16 | Delete stale branches (26 in carter, 20+ in admin) | carter, admin | Now | |
| TD17 | Household card/bank payment screen is a placeholder | household | Product decision | Remove it or integrate MoMo properly |
| TD18 | One owner for the shared schema; migrations consolidated | all | Now | ADR, runbook 05 §6 |
