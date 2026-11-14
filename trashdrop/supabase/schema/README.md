# Production schema snapshot

Generated from the production database by
`engineering/automation/schema-snapshot.mjs` (workflow *Schema snapshot*,
weekly and on demand). **Do not edit these files**: change the database with a
migration in `trashdrop/supabase/migrations/` (ADR-001), then refresh the
snapshot; the workflow opens a pull request when production changed.

| | Count |
|---|---|
| Tables (`tables/`: columns, constraints, indexes, row-level security, grants, policies, triggers) | 71 |
| Functions (`functions/`: every overload, with who may execute it) | 298 |
| Views (`views/`) | 15 |

Objects installed by extensions (PostGIS and others) are left out.
