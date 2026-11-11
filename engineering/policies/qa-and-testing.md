# QA and testing policy

**Owner:** QA Automation Engineer, with the CTO · **Review:** yearly

## What every change needs

| Level | Where it runs | Required for |
|---|---|---|
| Unit tests (Jest) | CI on every pull request | All code changes. New logic needs new tests. |
| Lint | CI (changed files) | All JavaScript changes |
| Guard tests for protected rules | CI | Never skipped: household pricing (`digitalBinService.promotion.test.js`, `pricing-promo.js`), carter payouts (`promotionalPayout.test.js`), admin fee checks (`pickupRequestUtils.test.js`) |
| Edge Function handler tests | CI (admin) | Changes to those functions |
| Manual regression on staging | QA, using the [release checklist](../templates/release-checklist.md) | Critical-workflow changes |
| End-to-end (Cypress/Playwright) | To be added in Phase 3 | The four critical workflows, once staging exists |

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
- Defects found before production compared with after (production defect
  leakage).
- Known-failing suites remaining (target: 0).

## Roadmap

| Phase | Work |
|---|---|
| 2 | Fix known-failing suites; tests for every bug fixed |
| 3 | End-to-end tests for QR Bag, Digital Bin, payments and dumping reports against staging; tests for database rules (RLS) in `supabase/tests` |
| 4 | Coverage reporting in CI; device testing on low-end Android |
