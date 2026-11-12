# TrashDrop Engineering Handbook

How the Technology & Digital Products Department builds, releases, runs and
secures TrashDrop's software. It puts the department programme (November 2026)
into practice.

> **Where this lives.** For now, the handbook lives in the household app repository
> because this is the repository the department can write to today. When the
> GitHub organisation exists ([runbook 01](runbooks/setup/01-github-organisation.md)),
> move this folder to a private `trashdrop/engineering` repository and leave a
> link here.

## Start here

| If you are… | Read |
|---|---|
| New to the team | [Onboarding guide](onboarding.md), [Charter](charter.md), [Repository governance](policies/repository-governance.md), [Change and release](policies/change-and-release.md), [Secure development](policies/secure-development.md) |
| Setting up a tool or account | [Setup tracker](setup-tracker.md), which links each runbook |
| Handling an outage | [Incident management](policies/incident-management.md) and the **Production incident** issue form |
| Changing the database | [Change and release §Database changes](policies/change-and-release.md#database-changes); for functions, the [database function review](runbooks/database-function-review.md) |
| Asking for access | The **Access request** issue form ([Access control](policies/access-control.md)) |

## Contents

**Policies** (approved by the CTO; changes need a pull request reviewed by the CTO)

1. [Access control](policies/access-control.md)
2. [Secure development, including AI coding tools](policies/secure-development.md)
3. [Change and release](policies/change-and-release.md)
4. [Backup and recovery](policies/backup-and-recovery.md)
5. [Incident management and support](policies/incident-management.md)
6. [Data protection technical controls](policies/data-protection-controls.md)
7. [Vendor and third-party management](policies/vendor-management.md)
8. [Repository governance](policies/repository-governance.md)

9. [QA and testing](policies/qa-and-testing.md)
10. [Vulnerability management](policies/vulnerability-management.md)
11. [Cloud and infrastructure management](policies/cloud-and-infrastructure.md)
12. [IT assets and corporate IT support](policies/it-assets-and-support.md)
13. [Information security](policies/information-security.md) (draft, for management approval)
14. [Business continuity](policies/business-continuity.md) (draft, for management approval)

1–8 are the priority documents from programme §7; 9–14 complete the list.
The [Technology strategy 2027–2029](technology-strategy.md) is a draft for
the CTO and CEO.

**Decisions:** [ADR-001 Database schema ownership](decisions/ADR-001-database-schema-ownership.md) (proposed) · [ADR-002 Who may call a database function](decisions/ADR-002-database-function-access.md) (accepted)

**Registers.** These are living records. The team keeps them current, and the scheduled reviews check them.

- [Products](registers/products.md) · [Infrastructure](registers/infrastructure.md) · [Vendors and licences](registers/vendors.md)
- [Access](registers/access-register.md) · [IT assets](registers/it-assets.md)
- [Risk](registers/risk-register.md) · [Technical debt](registers/tech-debt.md)

**Templates:** [Architecture decision record](templates/adr.md) · [Post-incident review](templates/postmortem.md) · [Release checklist](templates/release-checklist.md)

**Runbooks:** [account and tool setup, steps 01–09](setup-tracker.md) · [Database function review](runbooks/database-function-review.md) (TD19) · [A signed-out caller scanned the API](runbooks/api-scan-detected.md) · [Production database errors](runbooks/production-errors.md)

## What is automated

| Automation | Where | What it does |
|---|---|---|
| CI | `.github/workflows/ci-cd.yml` | Every pull request: lint, unit tests, pricing guard tests, build, preview deploy. Main: production deploy. |
| Security checks | `.github/workflows/security.yml` | Secret scan on every pull request and push; full scan weekly; dependency audit report. |
| Dependency updates | `.github/dependabot.yml` | Weekly update pull requests. |
| Database migrations | `.github/workflows/supabase-migrations.yml` | Manual only: list, dry-run, apply; staging or production (production needs approval). |
| Department bootstrap | `.github/workflows/engineering-bootstrap.yml` | Manual. Creates labels and one issue per setup task; safe to re-run (skips existing issues), so run it again after adding a setup step. First run 2026-11-11. |
| Security watch | `.github/workflows/security-watch.yml` | Daily: checks production as an outsider would (public key only), the Supabase security advisor, and the API logs for signed-out callers scanning the API; opens an issue on a regression (P1, or P2 for a scan that found nothing), closes it when fixed. |
| Error watch | `.github/workflows/error-watch.yml` | Daily: database errors in production over the last 24 hours, grouped by type; opens a P2 issue for a new or growing type, closes it when none are left. |
| Production smoke check | `.github/workflows/production-smoke.yml` | Hourly and after each household deploy: the three live sites and their key functions answer as expected; one issue while anything fails. |
| Database migration checks | `trashdrop/scripts/ci/check-migrations.js` (in CI) | New migrations: `SECURITY DEFINER` functions fix `search_path` and check the caller or revoke `anon`. |
| Governance cadence | `.github/workflows/governance-cadence.yml` | Opens the recurring review issues (monthly backup test, risk review and repository health across all three repositories; quarterly access review) and drafts the monthly CTO report from GitHub data. |
| Release notes | `.github/workflows/release-notes.yml` | After each successful production deploy: a GitHub Release listing the pull requests shipped, grouped (protected pricing, database, security, fixes, features). |
| Pull request labels | `.github/workflows/labeler.yml`, `.github/labeler.yml` | Labels from changed files: `protected-pricing` (owner approval needed), `database`, `product:whatsapp`, `ci`, `docs`, `dependencies`. |
| Review routing | `.github/CODEOWNERS` | Protected files need the named owner's review. |
| Intake | `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md` | Bug, incident, feature and access forms; pull request checklist. |
