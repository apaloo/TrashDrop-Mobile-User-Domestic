# 05 · Supabase staging and migration baseline

**Who:** owner creates the project; DevOps / Technical Lead does the rest · **Time:** half a day · **Cost:** a second project on the organisation's plan

Today all three apps share one production project and there is no staging.
This runbook creates staging and makes database changes repeatable.

## 1. Create the staging project

1. Supabase dashboard → the TrashDrop organisation → **New project** →
   name `trashdrop-staging`, same region as production, strong DB password
   (store it in Bitwarden → Staging secrets).
2. Settings → API: note the URL and publishable (anon) key.

## 2. Baseline the schema

Run from a laptop with the Supabase CLI. Put the production database URL
in an environment variable for this session only. Never write it to a file in git.

```bash
cd trashdrop
supabase db dump --db-url "$PROD_DB_URL" -f supabase/baseline/schema.sql
supabase db dump --db-url "$PROD_DB_URL" --role-only -f supabase/baseline/roles.sql
psql "$STAGING_DB_URL" -f supabase/baseline/roles.sql
psql "$STAGING_DB_URL" -f supabase/baseline/schema.sql
```

Commit `supabase/baseline/schema.sql` in a pull request (it has no data).
Load **synthetic** seed data into staging, never a copy of production users.

## 3. Repair the migration history

Migrations were applied by hand, so the history Supabase keeps may not list
them. For each environment:

```bash
supabase link --project-ref <ref>
supabase migration list            # local vs remote
# For every migration that IS in the database but missing from remote history:
supabase migration repair --status applied <version>
```

Only mark a migration applied after checking that its objects exist. Migration headers saying
"NOT APPLIED TO PRODUCTION" must be checked one by one.

## 4. GitHub environments

Repository → **Settings → Environments**:

| Environment | Secrets | Protection |
|---|---|---|
| `staging` | `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD` | none |
| `production` | `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD` | Required reviewers: CTO, Technical Lead; deployment branches: `main` only |

Repository secret (both): `SUPABASE_ACCESS_TOKEN` (a personal access token of
the `tech-admin@` Supabase user).

Then run **Actions → Database migrations → staging → list**. It should show no drift.

## 5. Point preview deploys at staging

Netlify → household site → Environment variables → set
`REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_ANON_KEY` to **staging** values
for the *Deploy previews* and *Branch deploys* contexts, and keep production values
for *Production*. Do the same in GitHub Actions if CI builds previews.

## 6. Name the schema owner

All three repositories change the same database. Record the decision in an
[architecture decision record](../../templates/adr.md): either all migrations
move into one repository, or each repository owns named tables and functions and
announces cross-app changes.
