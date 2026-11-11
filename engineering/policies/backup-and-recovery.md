# Backup and recovery policy

**Owner:** CTO (DevOps engineer operates) · **Review:** yearly, and after every restore

## What must be recoverable

| System | Criticality | RPO (max data loss) | RTO (max downtime) | Backup method |
|---|---|---|---|---|
| Supabase production database | Critical | 24 h now; 5 min once Point-in-Time Recovery is enabled | 4 h | Supabase daily backups (Pro plan) + weekly logical dump to company storage |
| Supabase Storage (photos: dumping reports, avatars) | High | 7 days | 24 h | Weekly copy to company storage |
| Source code | Critical | 0 (every push) | 1 h | GitHub, plus a monthly mirror clone kept by the CTO |
| Netlify sites and functions | High | 0 | 1 h | Rebuilt from git; previous deploys kept in Netlify |
| Configuration and secrets | Critical | n/a | 4 h | Password manager + infrastructure register (names, not values) |
| Google Workspace | Medium | Google retention | n/a | Google Vault (when licensed) |

RPO/RTO targets are proposals for CEO approval; adjust them to the Supabase
plan actually purchased.

## Rules

1. **A backup that has never been restored does not count.** On the first working day
   of each month, the governance-cadence workflow opens a *Backup restore
   test* issue. The DevOps engineer restores the latest production backup
   **into the staging project** (never into production), runs the checklist,
   and records how long it took and any problems.
2. Logical dumps contain personal data. Store them encrypted, in a
   company-owned location with access limited to production-access holders,
   and delete them after 90 days.
3. A restore into production needs the CTO's approval in an incident issue.

## Weekly logical dump (until automated)

```bash
# Run by the DevOps engineer. The database URL comes from the password manager, never from a file in git.
supabase db dump --db-url "$PROD_DB_URL" -f "trashdrop-schema-$(date +%F).sql"
supabase db dump --db-url "$PROD_DB_URL" --data-only -f "trashdrop-data-$(date +%F).sql"
```

Encrypt both files before upload (for example `gpg --symmetric`), and record
the run in the month's restore-test issue.
