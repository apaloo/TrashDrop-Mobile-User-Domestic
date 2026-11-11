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
| New to the team | [Charter](charter.md), [Repository governance](policies/repository-governance.md), [Change and release](policies/change-and-release.md), [Secure development](policies/secure-development.md) |
| Setting up a tool or account | [Setup tracker](setup-tracker.md), which links each runbook |
| Handling an outage | [Incident management](policies/incident-management.md) and the **Production incident** issue form |
| Changing the database | [Change and release §Database changes](policies/change-and-release.md#database-changes) |
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

These are the eight priority documents from programme §7. The other twelve
(Technology Strategy, IT Asset Management, Business Continuity Plan and so on)
follow in Phases 3–5. They are tracked in the [setup tracker](setup-tracker.md#governance-documents).

**Registers.** These are living records. The team keeps them current, and the scheduled reviews check them.

- [Products](registers/products.md) · [Infrastructure](registers/infrastructure.md) · [Vendors and licences](registers/vendors.md)
- [Access](registers/access-register.md) · [IT assets](registers/it-assets.md)
- [Risk](registers/risk-register.md) · [Technical debt](registers/tech-debt.md)

**Templates:** [Architecture decision record](templates/adr.md) · [Post-incident review](templates/postmortem.md) · [Release checklist](templates/release-checklist.md)

**Runbooks:** [account and tool setup, steps 01–09](setup-tracker.md)

## What is automated

| Automation | Where | What it does |
|---|---|---|
| CI | `.github/workflows/ci-cd.yml` | Every pull request: lint, unit tests, pricing guard tests, build, preview deploy. Main: production deploy. |
| Security checks | `.github/workflows/security.yml` | Secret scan on every pull request and push; full scan weekly; dependency audit report. |
| Dependency updates | `.github/dependabot.yml` | Weekly update pull requests. |
| Database migrations | `.github/workflows/supabase-migrations.yml` | Manual only: list, dry-run, apply; staging or production (production needs approval). |
| Department bootstrap | `.github/workflows/engineering-bootstrap.yml` | Run once: creates labels and one issue per setup task, assigned for the team to complete. |
| Governance cadence | `.github/workflows/governance-cadence.yml` | Opens the recurring review issues (monthly backup test, monthly risk review, quarterly access review) and drafts the monthly CTO report from GitHub data. |
| Review routing | `.github/CODEOWNERS` | Protected files need the named owner's review. |
| Intake | `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md` | Bug, incident, feature and access forms; pull request checklist. |
