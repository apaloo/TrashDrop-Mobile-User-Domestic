# Setup tracker

Every account, tool and control the department needs, in order. Running the
**Engineering bootstrap** workflow (Actions → Engineering bootstrap → Run
workflow) opens one GitHub issue per row, so progress is tracked on the
GitHub Projects board. This file is the master list. When a step is done, tick
it here in the same pull request that records any new register entries.

Legend: **Owner action** = needs the account owner (sign-up, payment, a
dashboard only they can open). **Team** = any engineer with access.

## Phase 1: Secure and own (weeks 0–2)

| # | Step | Who | Runbook | Done |
|---|---|---|---|---|
| 01 | Company GitHub organisation; transfer the three active repositories; make them private; archive the three inactive ones | Owner action | [01](runbooks/setup/01-github-organisation.md) | ☐ |
| 02 | GitHub Projects board "TrashDrop Engineering" with auto-add from all repositories | Team | [02](runbooks/setup/02-github-projects.md) | ☐ |
| 03 | Google Workspace: company domain email, groups, MFA enforced | Owner action | [03](runbooks/setup/03-google-workspace.md) | ☐ |
| 04 | Password manager: Bitwarden organisation **created 2026-11-11 (Free plan)**; still to do: owner two-step login, two collections, second member, move secrets ([inventory](checklists/secrets-inventory.md)) | Owner action | [04](runbooks/setup/04-password-manager.md) | ☐ |
| 08 | Branch protection, required checks, secret scanning, environments on every repository | Team (org admin) | [08](runbooks/setup/08-branch-protection-and-secrets.md) | ☐ |
| 09 | Supabase legacy-key clean-up after rotation (new keys in use; legacy keys disabled 2026-11-11; exposure-period log review done) | Owner action | [09](runbooks/setup/09-supabase-legacy-keys.md) | ☑ |

## Phase 2: Environments and visibility (weeks 2–4)

| # | Step | Who | Runbook | Done |
|---|---|---|---|---|
| 05 | Supabase staging project; schema baseline; migration history repaired on production | Owner action, then Team | [05](runbooks/setup/05-supabase-staging.md) | ☐ |
| 06 | Sentry error tracking for the household, carter and admin apps (code in all three, off until the DSN is set; carter #49, admin #108) | Owner action, then Team | [06](runbooks/setup/06-sentry.md) | ☐ |
| 07 | Uptime monitoring and alerting (Better Stack free tier) | Team | [07](runbooks/setup/07-uptime-monitoring.md) | ☐ |
| 07b | Security watch: set repository variables `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_REF` (and the existing `SUPABASE_ACCESS_TOKEN` secret), then run it once | Team | `.github/workflows/security-watch.yml` | ☐ |
| 07c | Monthly report for all three apps: add the `ENGINEERING_REPORT_TOKEN` secret (fine-grained, read-only: pull requests, actions, metadata on the carter and admin repositories) | Owner action | `.github/workflows/governance-cadence.yml` | ☐ |
| 10 | Copy CI, security checks, templates and CODEOWNERS to the carter and admin repositories (in review: carter #46, admin #107) | Team | [08 §Rolling out](runbooks/setup/08-branch-protection-and-secrets.md#rolling-out-to-the-other-repositories) | ☐ |

## Phase 2: Clear the known backlog

| # | Step | Who | Where | Done |
|---|---|---|---|---|
| 11 | Fix the known-failing test suites and delete them from each list (household 8, carter 4, admin 4; admin all 4 fixed in admin #111) | Team | `scripts/ci/known-failing-tests.txt` in each repository | ☐ |
| 12 | Work through the technical-debt register's "Now" items | Team | [tech-debt](registers/tech-debt.md) | ☐ |
| 13 | Fill every register (products, infrastructure, vendors, access, IT assets) | Team | [registers](registers/) | ☐ |

## Governance documents

The eight priority policies are written. The remaining programme §7 documents:

| Document | Owner | Target | Done |
|---|---|---|---|
| Technology Strategy | CTO | [draft](technology-strategy.md), approval pending | ☐ |
| Software Development Policy | CTO | covered by [Secure development](policies/secure-development.md) + [Change and release](policies/change-and-release.md) | ☑ |
| Code Review and Repository Management SOP | Technical Lead | covered by [Repository governance](policies/repository-governance.md) | ☑ |
| QA and Testing Policy | QA Engineer | [qa-and-testing](policies/qa-and-testing.md) | ☑ |
| Cloud and Infrastructure Management Policy | CTO / DevOps | [cloud-and-infrastructure](policies/cloud-and-infrastructure.md) | ☑ |
| IT Asset Management Policy | Support Engineer | [it-assets-and-support](policies/it-assets-and-support.md) | ☑ |
| Corporate IT Support SOP | Support Engineer | [it-assets-and-support](policies/it-assets-and-support.md) | ☑ |
| Information Security Policy | Management / CTO | [draft](policies/information-security.md), approval pending | ☐ |
| Vulnerability Management SOP | CTO / Security specialist | [vulnerability-management](policies/vulnerability-management.md) | ☑ |
| Business Continuity Plan | Management / CTO | [draft](policies/business-continuity.md), approval pending | ☐ |
| Technology Vendor and Licence Register | CTO | [vendors](registers/vendors.md) | ☑ |
