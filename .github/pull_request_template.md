## What changes and why

<!-- One or two sentences a non-engineer could follow. Link the issue: Closes #123 -->

## Type of change

- [ ] Bug fix
- [ ] New feature or change to existing behaviour
- [ ] Database migration
- [ ] Configuration, CI or infrastructure
- [ ] Documentation only

## Risk

- [ ] Touches a **critical workflow**: QR Bag, Digital Bin, payments/payouts, sign-in, illegal dumping
- [ ] Touches **protected pricing or points** (see CLAUDE.md): owner's written approval is in this PR, and changed database fingerprints are recorded
- [ ] Changes **who can see or change data** (RLS, RPC permissions, roles)
- [ ] Adds or changes a **secret, API key or third-party service** (vendor register updated)

## Database changes

- [ ] No database changes
- [ ] New migration in `trashdrop/supabase/migrations/` (never an edit to an applied one)
- [ ] Rollback script added in `trashdrop/supabase/diagnostics/`
- [ ] Tested on **staging** before production

## How it was tested

<!-- Unit tests added or updated, what you checked by hand, on which device/browser. -->

## Checklist

- [ ] CI is green (lint, unit tests, pricing guard tests, build, secret scan)
- [ ] No secrets, keys, real customer data or `.env` files in the diff
- [ ] User-facing text reviewed
- [ ] Docs or runbooks updated if behaviour changed
- [ ] If AI tools helped write this: I have read and understood every line (engineering/policies/secure-development.md §AI)
