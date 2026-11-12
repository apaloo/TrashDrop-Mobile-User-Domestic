# Engineer onboarding

Your first week. Work through it in order and tick the boxes in your
onboarding issue (the **Access request** form opens it).

## Day 1: accounts and reading

- [ ] Company Google account with 2-step verification ([runbook 03](runbooks/setup/03-google-workspace.md))
- [ ] Password manager invite accepted; you can see the *Shared accounts and operations* collection
- [ ] GitHub account with 2FA, added to the `engineers` team
- [ ] Read: [Charter](charter.md), [Repository governance](policies/repository-governance.md),
      [Change and release](policies/change-and-release.md),
      [Secure development (including AI tools)](policies/secure-development.md)
- [ ] Read the protected rules: `CLAUDE.md` in each repository and
      `docs/DIGITAL_BIN_PRICING.md` in this one

## Day 2: run the three apps locally

You need Node 20 (`nvm install 20`) and Git.

> **There is no staging database yet** (setup step 05). Until there is, a
> local app talks to **production**. Use only the test accounts from the
> password manager, never change real customers' data, and never run SQL or
> migrations from your machine.

### Household app: `TrashDrop-Mobile-User-Domestic`

```bash
cd trashdrop
CYPRESS_INSTALL_BINARY=0 npm ci
```

Create `trashdrop/.env.development.local` (git-ignored) with the values from
*Shared accounts and operations → Household app (test)*:

```
REACT_APP_SUPABASE_URL=...
REACT_APP_SUPABASE_ANON_KEY=sb_publishable_...
```

| Task | Command |
|---|---|
| Run | `npm start` (http://localhost:3000) |
| Run over HTTPS (camera/QR on a phone) | `node generate-cert.js`, then `npm run start:https`. The certificates are generated locally and never committed |
| Unit tests, as CI runs them | `npm run test:ci` |
| Lint | `npm run lint` |
| Pricing guard tests | `npx jest --ci src/services/__tests__/digitalBinService.promotion.test.js` |

### Carter app: `TrashDrop-Mobile-Collector-Driver`

```bash
CYPRESS_INSTALL_BINARY=0 npm ci
cp .env.example .env    # then fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY only
```

Never set `VITE_TRENDIPAY_API_KEY` or `VITE_TRENDIPAY_WEBHOOK_SECRET`.
Anything named `VITE_*` is built into the browser bundle; the payment keys
live only in the Edge Functions' secrets.

| Task | Command |
|---|---|
| Run | `npm run dev` |
| Unit tests, as CI runs them | `node scripts/ci/run-tests.mjs` |
| Lint the files you changed | `scripts/ci/lint-changed.sh origin/main` |

### Admin portal: `TrashDrop_Management_webApp_admins`

```bash
CYPRESS_INSTALL_BINARY=0 PUPPETEER_SKIP_DOWNLOAD=1 npm ci --legacy-peer-deps
npm start
```

`.env.development` is committed and holds only public values. Tests: `npm run
test:ci`. Edge Function tests: `node --experimental-strip-types --test
supabase/functions/*/*.test.mjs` (Node 22).

## Day 3: first change

- [ ] Pick a `good first issue`. A suite from the known-failing lists (setup
      issue 11) is ideal: it teaches you the codebase and the test set-up.
- [ ] Branch, fix, open a pull request with the template filled in, get one review, merge.
- [ ] Watch your change reach production (Netlify deploy) and check it.

## Week 1: the platform

- [ ] Walk through each critical workflow in the app with the Technical Lead:
      QR Bag, Digital Bin (including WhatsApp booking), payments and cash-outs,
      illegal-dumping reports ([release checklist](templates/release-checklist.md)).
- [ ] Read the [product](registers/products.md) and [infrastructure](registers/infrastructure.md) registers.
- [ ] Shadow one support or incident shift ([incident management](policies/incident-management.md)).

## How we work, in one screen

- Every change: issue → branch → pull request → green CI → one review → merge.
- The database decides prices, payouts and permissions; the app only shows them.
- No secrets in code, chat, issues or AI prompts.
- Database changes are new migration files, applied through the
  *Database migrations* workflow, never pasted into production.
- If you don't understand a line an AI tool wrote, don't commit it.
