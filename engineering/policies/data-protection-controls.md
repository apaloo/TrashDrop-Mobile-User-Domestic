# Data protection technical controls

**Owner:** CTO, with the Data Protection Supervisor (DPS) · **Review:** yearly

The DPS owns the privacy programme (lawful basis, notices, data-subject
requests, breach reporting decisions). This document lists the technical
controls the department operates for it, in line with Ghana's Data Protection
Act, 2012 (Act 843).

## Data classification

| Class | Examples in TrashDrop | Controls |
|---|---|---|
| **Restricted** | MoMo / payment numbers, ID documents, exact home GPS, auth tokens | RLS to owner and named staff roles only; never in logs, analytics, error reports or AI prompts; encrypted at rest (Supabase default) |
| **Confidential** | Names, phone numbers, emails, addresses, pickup history, carter earnings, households' ratings of collectors and their comments | RLS to owner and staff; masked in admin lists where possible. Ratings: the household reads its own, staff read all, a collector sees only their average (`job_ratings`, `td_rate_job`; issue #186) |
| **Internal** | Aggregated statistics, operational dashboards | Staff only |
| **Public** | Published environmental reports, website content | No restriction |

## Controls

1. **Row-level security on every table**, reviewed whenever a table or role
   changes. Staged RLS was completed on 10 Nov 2026. Re-verify quarterly with
   the Supabase security advisor (Dashboard → Advisors → Security).
2. **No personal data in non-production.** Staging uses synthetic or
   anonymised data. Production dumps never go to laptops except during an
   approved restore test.
3. **Error tracking scrubs personal data.** Sentry is configured with
   `sendDefaultPii: false`, and form values are not captured.
   **Console logs carry no personal data either.** Log that something
   happened, or a yes/no (`hasEmail: !!email`), never an email, phone number,
   name or address: a shared phone's console, a browser extension or a support
   screenshot can read it. Checked by CI in all three apps
   (`scripts/ci/check-log-privacy.cjs`), since 2026-11-13, when the household
   app was found writing the email at every sign-in, sign-up and password
   reset, and a saved location's address.
4. **Retention.** Proposed defaults for DPS approval: location pings 90 days;
   application logs 30 days; closed dumping-report photos 2 years; payment
   records 7 years (tax). Implement as scheduled database jobs once approved.
5. **Access to personal data is logged** (admin audit log) and reviewed in the
   quarterly access review.
6. **Privacy by design.** The feature request form asks whether new personal data is
   collected; if so, the DPS reviews before build.
   Collector ratings (2026-11-13, issue #186): collectors see only their
   average; comments are staff only; the privacy notices (trashdrops.com/privacy,
   collector app Privacy page) say so. Retention to be set with the defaults
   below.
7. **Breach handling** follows [Incident management](incident-management.md);
   the DPS decides on notification to the Data Protection Commission and
   affected people.
