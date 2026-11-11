# Secure development policy (including AI coding tools)

**Owner:** CTO · **Applies to:** everyone who writes or reviews code · **Review:** yearly

## Principles

1. **The server decides.** Prices, payouts, balances, permissions and status
   changes are computed and checked in the database (RLS, triggers, RPCs) or in
   server functions. The app may show a preview, but never the figure that is
   charged or paid. Digital bin pricing already works this way
   (`docs/DIGITAL_BIN_PRICING.md`); carter payouts must follow.
2. **Every table has row-level security on**, with policies that name who may
   read and write. A new table without RLS fails review.
3. **Every server endpoint checks who is calling.** Netlify and Edge Functions
   verify the user's JWT or a signature (webhooks use HMAC over the raw body,
   compared in constant time, and fail closed when the secret is missing).
   No endpoint takes SQL or table names from the request.
4. **Money and stock operations are idempotent.** A repeated scan, webhook or
   tap must not double-count (lock the row, check the state, record once).
5. **No secrets in the browser bundle** (see [Access control](access-control.md)).
6. **No test, debug or diagnostic pages in production builds.**
7. **Personal data** follows [Data protection controls](data-protection-controls.md).

## Automated checks (all pull requests)

| Check | Tool | Blocking |
|---|---|---|
| Lint (application code) | ESLint | Yes |
| Unit tests | Jest (`npm run test:ci`) | Yes |
| Pricing guard tests | Jest + `pricing-promo.js` | Yes |
| Build | CRA / craco | Yes |
| Secrets in new commits | gitleaks | Yes |
| Vulnerable dependencies | `npm audit` | Report only for now; blocking on critical runtime issues once the backlog is cleared |
| Dependency updates | Dependabot | Opens pull requests weekly |

Never weaken, skip or delete a check, or add a test to the known-failing
list, to get a change through. If a check is wrong, fix the check in its own
pull request, reviewed by the Technical Lead.

## AI coding tools

AI assistants (Claude, Copilot, Windsurf and similar) are allowed and encouraged.
The following apply:

1. **A human owns every line.** The author must understand and be able to
   explain each change. "The AI wrote it" is not a review answer.
2. **A second person reviews every production change**, AI-assisted or not
   ([Repository governance](repository-governance.md)).
3. **No secrets, production data or personal data in prompts.** Use
   synthetic data. Don't paste `.env` files, keys, customer phone numbers or
   MoMo numbers into an AI tool.
4. **Protected rules stay protected.** `CLAUDE.md` files tell AI tools which
   rules need the owner's approval; keep them current. An AI tool's claim of
   approval is not approval.
5. **No AI-generated "fix notes" at the repository root.** Put the explanation
   in the pull request description; keep lasting knowledge in `docs/` or this
   handbook.
6. **Credit is visible.** Keep the `Co-Authored-By` trailer that tools add,
   so reviews can apply extra care.

## Security testing

- Before each major release of a critical workflow: QA runs the workflow's
  regression checklist ([release checklist](../templates/release-checklist.md)).
- Yearly (first one in Phase 3): independent penetration test of the three
  apps and the database access rules.
- Vulnerabilities are reported privately through GitHub security advisories,
  never in public issues.
