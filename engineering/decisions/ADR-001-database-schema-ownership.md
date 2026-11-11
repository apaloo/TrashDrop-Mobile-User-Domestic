# ADR-001: Who owns the shared database schema

**Status:** Proposed (for the CTO's decision) · **Date:** 2026-11-11

## Context

The household app, carter app and admin portal share one Supabase database.
All three repositories contain migrations that change it:

- About 100 migration files exist across the three repositories, but production's migration history
  recorded 26 before 2026-11-11. The rest were pasted into the SQL editor by hand.
- Some database objects are defined in more than one repository (for
  example `protect_collector_admin_fields` in both the carter and admin
  repositories), so the last one applied wins, silently.
- No repository can rebuild the database from scratch, and there is no
  staging copy to test a change against the other two apps.

## Options

| Option | For | Against |
|---|---|---|
| **A. One database repository** (`trashdrop-platform`) holding the baseline schema, every migration, rollback scripts and database tests; app repositories hold only app code and their own Edge Functions | One history; one review point for every schema change; easy to rebuild staging; cross-app impact is visible | Schema change and app change land in two pull requests; needs a new repository (after the GitHub organisation, runbook 01) |
| B. Each repository owns named tables and functions | Changes stay next to the app that needs them | Ownership of shared tables (`profiles`, `pickup_requests`, `digital_bins`, `bin_payments`) is unclear; history stays split |
| C. Keep as is | No work | Drift continues; a migration from one app can break another unseen |

## Decision (proposed)

**Option A.**

- **Until the new repository exists**, all new migrations go into
  `trashdrop/supabase/migrations/` in the household repository. It already
  has the *Database migrations* workflow with staging and production
  environments.
- The carter and admin repositories stop adding migrations. Their pull
  requests that need a schema change link a household-repository pull
  request.
- Edge Functions stay with the app that calls them.

## Consequences

- One `supabase migration list` to check; one place for the baseline (runbook 05).
- Reviewers of a schema change see every app that uses the object.
- Existing migration files in the carter and admin repositories stay as history,
  marked "moved: see TrashDrop-Mobile-User-Domestic" in a README.
- Follow-ups: create `trashdrop-platform` after runbook 01; move the
  baseline and migrations there; update CODEOWNERS so schema changes need
  the Technical Lead's review.
