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
8. **Database functions that run with their owner's rights** (`SECURITY
   DEFINER`) fix their `search_path`, and either check who is calling
   (`td_assert_self_or_staff(<user id>)` for "this account or staff",
   `auth.uid()`, `td_can_manage_requests()`) or are revoked from `anon` in the
   same migration. Postgres lets everyone execute a new function by default,
   so a function that takes a user id and skips this works for anyone, signed
   in or not. Server-only functions are granted to `service_role` alone.
   Checked by CI for migrations from 2026-11-11 on. Why, and the three
   states a function can be in: [ADR-002](../decisions/ADR-002-database-function-access.md).

## Automated checks (all pull requests)

| Check | Tool | Blocking |
|---|---|---|
| Lint (application code) | ESLint | Yes |
| Unit tests | Jest (`npm run test:ci`) | Yes |
| Pricing guard tests | Jest + `pricing-promo.js` | Yes |
| Database functions in new migrations (principle 8) | `scripts/ci/check-migrations.js` | Yes |
| Build | CRA / craco | Yes |
| Secrets in new commits | gitleaks | Yes |
| Vulnerable dependencies | `npm audit` | Yes for critical findings in runtime dependencies; high and lower are reported |
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
