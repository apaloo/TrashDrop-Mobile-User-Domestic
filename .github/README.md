# GitHub automation

The engineering handbook explains the process these files implement:
[`engineering/README.md`](../engineering/README.md).

| Workflow | Runs | What it does |
|---|---|---|
| `ci-cd.yml` | Pull requests and pushes to `main` | Lint, unit tests (`npm run test:ci`), pricing guard tests, build; Netlify preview for pull requests; production deploy from `main` |
| `security.yml` | Pull requests, pushes, weekly | gitleaks secret scan; `npm audit` report |
| `supabase-migrations.yml` | Manual only | `list`, `dry-run` or `apply` migrations on `staging` or `production` (production needs approval) |
| `engineering-bootstrap.yml` | Manual, once | Labels and setup issues |
| `governance-cadence.yml` | 1st of each month | Backup-restore test, risk review, quarterly access review, monthly CTO report draft |

Other files: `dependabot.yml` (weekly dependency pull requests), `CODEOWNERS`
(required reviewers), `pull_request_template.md`, `ISSUE_TEMPLATE/` (bug,
incident, feature, access request). Secrets the workflows need are listed in
[`SECRETS.md`](SECRETS.md).
