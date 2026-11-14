# QA and testing policy

**Owner:** QA Automation Engineer, with the CTO · **Review:** yearly

## What every change needs

| Level | Where it runs | Required for |
|---|---|---|
| Unit tests (Jest) | CI on every pull request | All code changes. New logic needs new tests. |
| Lint | CI (all of `src`; collector: changed files until its last 3 errors, in protected payout files, are approved) | All JavaScript changes |
| Test coverage | CI job summary: the whole app and each file in `scripts/ci/critical-files.txt`, against `scripts/ci/coverage-floors.json` | Blocks merge when one drops more than 0.5 points below its floor (since 2026-11-13). A floor only goes up: when coverage rises 2 points above one, raise it in the same pull request. New logic in a critical file comes with tests that raise its figure |
| Guard tests for protected rules | CI | Never skipped: household pricing (`digitalBinService.promotion.test.js`, `pricing-promo.js`), carter payouts (`promotionalPayout.test.js`), admin fee checks (`pickupRequestUtils.test.js`) |
| Edge Function handler tests | CI (admin) | Changes to those functions |
| Manual regression on staging | QA, using the [release checklist](../templates/release-checklist.md) | Critical-workflow changes |
| Browser tests (Playwright, all three apps) | CI job *browser-tests* on every pull request (since 2026-11-14; household `trashdrop/e2e/`, collector and admin `browser-tests/`, one shared fake): the built app in Chromium on a phone screen, against a fake Supabase (`trashdrop/e2e/fakeSupabase.mjs`), so no real project or account is touched. Covers sign-in and booking a digital bin end to end, with the price checked against the accepted pricing | Changes to sign-in, routing and the screens they cover; a new critical screen gets one. Run locally with `npm run build` (placeholder settings) then `npm run test:browser` |
| End-to-end against staging | To be added in Phase 3 | The four critical workflows, once staging exists |

## Rules

1. **CI green means tested.** Never skip, disable or weaken a test to get
   green. A test that is wrong is fixed in its own pull request.
2. **The known-failing lists only shrink.** Each repository's
   `scripts/ci/known-failing-tests.txt` lists suites that were already broken
   when CI was switched on. Adding to it needs the Technical Lead's review.
3. **Test data is synthetic.** No real customer names, phone numbers, MoMo
   numbers or addresses in tests, fixtures or screenshots.
4. **Bugs get a test.** A production bug is fixed together with a test that
   fails without the fix.
5. **Business acceptance.** Critical-workflow changes need the business
   owner's acceptance recorded on the pull request (release checklist
   sign-off).

## Measures (monthly report)

- Critical-workflow regression coverage: the share of release-checklist
  items covered by automated tests (target: rising each quarter).
- Line coverage of the critical files, from the "Test coverage" section of
  the latest CI run on `main` in each repository (target: rising each month;
  none at 0%).
- Defects found before production compared with after (production defect
  leakage).
- Known-failing suites remaining (target: 0).

## Roadmap

| Phase | Work |
|---|---|
| 2 | Fix known-failing suites; tests for every bug fixed |
| 3 | End-to-end tests for QR Bag, Digital Bin, payments and dumping reports against staging; tests for database rules (RLS) in `supabase/tests` |
| 4 | ~~Coverage thresholds on the critical files~~ (floors since 2026-11-13; reporting started 2026-11-11); device testing on low-end Android |
