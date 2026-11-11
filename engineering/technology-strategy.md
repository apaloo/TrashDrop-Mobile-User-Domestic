# Technology strategy 2027–2029

**Status:** Draft for the CTO and CEO (programme Phase 5 deliverable) · **Review:** yearly

## Where we start (November 2026)

- Three live apps (household with WhatsApp booking, carter, admin portal) on
  React, Supabase (Postgres) and Netlify. The features are broad and the
  business logic is moving into the database.
- Engineering controls were put in place in November 2026: CI on every
  pull request, secret scanning, Dependabot, review rules, error monitoring
  (switched off until configured), a daily security watch, this handbook,
  and governance automation.
- Gaps: one shared production database with no staging; database
  permissions still too broad for signed-in users (TD19); much of the knowledge sits with one person; build
  tools near end of life (Create React App, Node 16 on the admin build); no
  end-to-end tests.

## Principles

1. **Improve, don't rewrite.** Keep React, Supabase and Netlify; fix the foundations first.
2. **The database is the product's core.** Prices, payouts and permissions
   are enforced there and covered by tests.
3. **Built for the field.** Low-end Android phones, poor connectivity and
   mobile money come first.
4. **Measured.** Every goal below has a number in the monthly report.

## Goals

| Year | Goal | Measure |
|---|---|---|
| 2027 H1 | Safe change: staging, migrations from one repository (ADR-001), required reviews, end-to-end tests for the four critical workflows | 100% reviewed production changes; 0 known-failing test suites; migrations drift 0 |
| 2027 H1 | Security baseline: database permissions restricted to owner/staff (TD19); yearly penetration test; repositories private and company-owned | No ERROR-level advisor findings; pen-test highs fixed in 7 days |
| 2027 H2 | Reliability: monitoring and alerting live; backup restore tested monthly; 99.5% availability | Availability per app; restore time |
| 2027 H2 | Modern build: Vite and Node 20+ for all apps; TypeScript for new code | Build-tool versions; % TypeScript |
| 2028 | Scale and markets: multi-country configuration (Ghana, Liberia started); MMDA reporting as a product; data warehouse for environmental reporting | Countries live; MMDAs using reports |
| 2028–2029 | Efficiency: route optimisation and demand forecasting for carters; automated reconciliation of payments | Pickups per carter-hour; reconciliation differences |

## Investments (to be costed in the yearly budget)

Staging database, Sentry and uptime plans, GitHub Team, yearly penetration
test, a data warehouse (2028), and the engineering team in programme §3.

## Risks to the strategy

Key-person dependency until the team is hired; provider costs as volume
grows (Maps, WhatsApp); payment-provider concentration (TrendiPay only).
See the [risk register](registers/risk-register.md).
