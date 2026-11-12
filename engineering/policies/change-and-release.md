# Change and release policy

**Owner:** CTO · **Applies to:** all production changes (code, database, configuration) · **Review:** yearly

## The path to production

```
issue ─► branch ─► pull request ─► CI green ─► review ─► merge to main ─► automatic deploy ─► check
```

1. **Every change starts from an issue** on the Projects board (bug, feature,
   incident or chore). Small fixes may open the issue and the pull request
   together.
2. **Branch from `main`**: `feat/…`, `fix/…`, `chore/…`, `db/…`.
3. **Open a pull request** and complete its template.
4. **CI must be green before you merge.** No one merges over a red or
   unfinished check. This is the only gate: Netlify publishes every push to
   `main` to production within about a minute, without waiting for CI (and
   every pull request to its preview). Until branch protection is on (setup
   step 08), nothing enforces it but this rule.
5. **One approving review from someone other than the author.** Protected
   files also need their CODEOWNER. Until a second engineer joins, the CTO or
   the retained specialist reviews; the author merging their own unreviewed
   change is not allowed.
6. **Merge** (squash). All three apps deploy to production automatically
   from `main` (Netlify builds them). The production smoke check runs about
   7 minutes after each household push, whatever CI concluded, and the
   release notes flag a commit whose CI failed.
7. **Check production** within 30 minutes: open the changed screen and watch
   Sentry for new errors.

## Change classes

| Class | Examples | Extra requirement |
|---|---|---|
| Standard | UI, copy, non-critical bug fix | None beyond the path above |
| Critical workflow | QR Bag, Digital Bin, payments/payouts, sign-in, dumping reports, WhatsApp booking | QA sign-off on the [release checklist](../templates/release-checklist.md) in the pull request; release during working hours (Mon–Thu, 09:00–15:00 Africa/Accra) |
| Protected business rule | Pricing, promotions, payouts | Owner's written approval in the pull request; docs and guard tests updated in the same pull request |
| Emergency fix (P1) | Production outage | May merge with the CTO's approval in the incident issue; the review happens within 1 working day afterwards |

## Database changes

1. A change is a **new file** in `trashdrop/supabase/migrations/`
   (`YYYYMMDDHHMMSS_short_name.sql`). Never edit a migration that has been
   applied anywhere.
2. Add a **rollback script** in `trashdrop/supabase/diagnostics/`.
3. Apply to **staging** first: Actions → *Database migrations* → target
   `staging`, mode `dry-run`, then `apply`. Test the apps against staging.
4. Apply to **production** from `main`: target `production`, mode `dry-run`,
   then `apply`. The `production` environment waits for a named approver.
5. **Do not paste SQL into the Supabase SQL editor on production** except
   during a P1 incident. Afterwards, the same SQL lands as a migration within one
   working day, and the migration history is repaired.
6. One schema, three apps: every migration that changes a table, function or
   policy used by another app is announced in the pull request and tested
   with that app on staging.

## Rollback

- **Frontend:** in Netlify, open *Deploys*, choose the last good deploy and
  select *Publish deploy*. This takes about 1 minute. Then revert the pull
  request on GitHub.
- **Database:** run the migration's rollback script through a new migration.
  Only if data was damaged, restore from backup ([Backup and recovery](backup-and-recovery.md)).

## Traceability

Every production change is traceable through: the issue, the pull request with
its review and CI run, the merge commit, the Netlify deploy, and, for
database changes, the *Database migrations* run with its approver.
