# 08 · Branch protection, required checks and secret scanning

**Who:** organisation or repository admin · **Time:** 20 minutes per repository

Private repositories need **GitHub Team** for branch protection rules and
required reviews. On GitHub Free they only work on public repositories.

## For each repository

1. **Settings → General → Pull requests:** allow squash merging only, and tick
   *Automatically delete head branches*.
2. **Settings → Rules → Rulesets → New branch ruleset** named `main`:
   - Target: default branch; Enforcement: **Active**; no bypass list (or the CTO
     only, for P1 emergencies)
   - ✔ Restrict deletions ✔ Block force pushes
   - ✔ Require a pull request before merging: 1 approval, dismiss stale
     approvals, **require review from Code Owners**, require conversation resolution
   - ✔ Require status checks to pass. In the household repository these are
     **build-and-test** and **Secret scan (gitleaks)**.
3. **Settings → Code security:** enable Dependency graph, **Dependabot
   alerts**, **Dependabot security updates**, **Secret scanning** and
   **Push protection**. These are free on public repositories; on private
   ones they need GitHub Secret Protection (paid). The gitleaks workflow
   covers secret scanning in the meantime.
4. **Settings → Actions → General:** set workflow permissions to *Read
   repository contents*; allow GitHub Actions to create pull requests: **off**.
5. **Settings → Environments:** see [runbook 05](05-supabase-staging.md#4-github-environments).
6. **Run the bootstrap once:** Actions → *Engineering bootstrap* → Run
   workflow. It creates the labels and the setup issues.

## Rolling out to the other repositories

The household repository holds the reference set. Copy it into the carter and admin repositories, adapting each item as follows:

| File | Carter app (Vite, Jest) | Admin portal (CRA) |
|---|---|---|
| `.github/workflows/ci-cd.yml` | Working directory `.`; `npm ci`; `npx eslint src`; `npx jest --ci`; `npm run build`. Netlify builds the site itself, so drop the deploy jobs | Working directory `.`; `npm ci --legacy-peer-deps`; `CI=true npx react-scripts test --watchAll=false`; `npm run build`. Drop the deploy jobs. |
| `.github/workflows/security.yml`, `.gitleaks.toml`, `.github/dependabot.yml` | Copy; change the npm directory to `/` | Copy; change the npm directory to `/` |
| `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/` | Copy unchanged | Copy unchanged |
| `.github/CODEOWNERS` | Add the payout and withdrawal files and `supabase/functions/` | Add `supabase/migrations/` and the pricing-check migration |

Run each repository's test suite once before making the check required. Put any
suite that already fails into a known-failing list, as the household app does.
