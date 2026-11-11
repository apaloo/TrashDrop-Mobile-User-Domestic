# Infrastructure register

**Owner:** DevOps / Cloud engineer · **Checked:** monthly (cost) and quarterly (access)

Record **names and locations, never secret values**. Project and site IDs
are not secrets, but keep them in the password manager entry so this file
can stay brief.

| Component | Provider | Environment | Account owner (email) | Used by | Secrets stored in | Last key rotation | Backup | Notes |
|---|---|---|---|---|---|---|---|---|
| Postgres, Auth, Storage, Realtime, Edge Functions | Supabase | production | _to fill_ | all apps | Bitwarden / Production secrets | 2026-11 (new `sb_publishable_`/`sb_secret_` keys; legacy JWT keys disabled 2026-11-11) | Supabase daily; see backup policy | Shared by three apps |
| Postgres (staging) | Supabase | staging | _to fill_ | previews, testing | Bitwarden / Shared accounts and operations | n/a | none needed | Runbook 05 |
| Household site + functions | Netlify | production + previews | _to fill_ | households | Netlify env vars | _to fill_ | git | `base = trashdrop` |
| Carter site | Netlify | production | _to fill_ | carters | Netlify env vars | _to fill_ | git | |
| Admin portal + website | Netlify | production | _to fill_ | staff, public | Netlify env vars | _to fill_ | git | Node 16 build image: upgrade |
| Source code and CI | GitHub | all | _to fill_ | engineering | Actions secrets / environments | n/a | GitHub + monthly mirror | Runbook 01 |
| Domain and DNS (trashdrops.com) | _to fill (registrar)_ | all | _to fill_ | email, sites | Bitwarden / Production secrets | n/a | n/a | |
| Error tracking | Sentry | all | tech-admin@ | engineering | n/a (DSN is public) | n/a | n/a | Runbook 06 |
| Uptime monitoring | Better Stack | all | tech-admin@ | engineering | n/a | n/a | n/a | Runbook 07 |

## Environment variables by app (names only)

| App | Browser (public) | Server (secret) |
|---|---|---|
| Household | `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_SENTRY_DSN`, `REACT_APP_SENTRY_ENVIRONMENT` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE(_KEY)`, `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_FLOW_ID` |
| Carter | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_MAPS_API_KEY` (referrer-restricted) | Edge Functions: `SERVICE_ROLE_KEY`, TrendiPay API key, `TRENDIPAY_WEBHOOK_SECRET` |
| Admin | `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY` | Edge Functions: Resend API key, Facebook app secret; Actions: `SUPABASE_SERVICE_ROLE_KEY` |
