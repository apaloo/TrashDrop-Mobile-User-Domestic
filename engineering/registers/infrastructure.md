# Infrastructure register

**Owner:** DevOps / Cloud engineer · **Checked:** monthly (cost) and quarterly (access)

Record **names and locations, never secret values**. Project and site IDs
are not secrets, but keep them in the password manager entry so this file
can stay brief.

| Component | Provider | Environment | Account owner (email) | Used by | Secrets stored in | Last key rotation | Backup | Notes |
|---|---|---|---|---|---|---|---|---|
| Postgres, Auth, Storage, Realtime, Edge Functions | Supabase organisation "TrashDrop" (**Pro**), project `tfdedlqdsajjdjkerkli` | production | owner's personal account → `tech-admin@` (step 03) | all apps | Bitwarden / Production secrets | 2026-11 (new `sb_publishable_`/`sb_secret_` keys; legacy JWT keys disabled 2026-11-11) | Supabase daily; see backup policy | Shared by three apps |
| Postgres (staging) | Supabase | staging | not created yet (runbook 05) | previews, testing | Bitwarden / Shared accounts and operations | n/a | none needed | Runbook 05 |
| Household site + functions | Netlify team (**Pro**), site `trashdrop-mobile-przsu` | production + previews | owner's personal account → `tech-admin@` (step 03) | households | Netlify env vars | 2026-11 (Supabase keys) | git | `base = trashdrop` |
| Carter site | Netlify site `trashdrop-mobile-collector` (collector.trashdrops.com) | production + previews | owner's personal account → `tech-admin@` (step 03) | carters | Netlify env vars | 2026-11 (Supabase keys) | git | |
| Admin portal + website | Netlify site `luxury-valkyrie-2ebd15` (trashdrops.com) | production + previews | owner's personal account → `tech-admin@` (step 03) | staff, public | Netlify env vars | 2026-11 (Supabase keys) | git | Node 16 build image: upgrade |
| Source code and CI | GitHub (personal account `apaloo` until step 01) | all | owner's personal account → `tech-admin@` (step 03) | engineering | Actions secrets / environments | n/a | GitHub + monthly mirror | Runbook 01 |
| Domain and DNS (trashdrops.com) | _registrar: owner to fill_ | all | owner's personal account → `tech-admin@` (step 03) | email, sites | Bitwarden / Production secrets | n/a | n/a | |
| Error tracking | Sentry | all | tech-admin@ | engineering | n/a (DSN is public) | n/a | n/a | Runbook 06 |
| Uptime monitoring | Better Stack | all | tech-admin@ | engineering | n/a | n/a | n/a | Runbook 07 |

## Netlify sites (checked 2026-11-11)

| Site | Serves | Public address | Notes |
|---|---|---|---|
| `trashdrop-mobile-przsu` | Household app | `app.trashdrops.com` (since 2026-10-20; `netlify.toml` sends the old `*.netlify.app` address there) | Netlify still lists `trashdrop-mobile.windsurf.build` as this site's primary domain; that name no longer resolves and no traffic uses it. Tidy-up: make `app.trashdrops.com` the primary domain and remove the Windsurf one |
| `trashdrop-mobile-collector` | Carter app | collector.trashdrops.com | |
| `luxury-valkyrie-2ebd15` | Admin portal and public website | trashdrops.com | Node 16 build image |
| `trashdrop-web-admin` | Old admin portal | trashdrop-web-admin.netlify.app | Last deployed July 2025: confirm unused, then delete (R15) |
| `koniginminingservices` | **Not a TrashDrop site** | | Move to its owner's own team (R15) |

## Supabase Edge Functions (checked 2026-11-11)

Deploy from git only (R14). Source of truth:

| Function | Source | Caller check |
|---|---|---|
| `trendipay-collection`, `trendipay-disbursement`, `trendipay-proxy`, `trendipay-webhook` | carter `supabase/functions/` | Signed-in user or TrendiPay HMAC (carter #48) |
| `send-sms-hook` | carter `supabase/functions/` (added in carter #54; was in no repository) | Standard Webhooks signature from Supabase Auth; SMS via Arkesel |
| `pickup-email-alerts`, `access-decision-emails`, `facebook-feed` | admin `supabase/functions/` | |

## Environment variables by app (names only)

| App | Browser (public) | Server (secret) |
|---|---|---|
| Household | `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_SENTRY_DSN`, `REACT_APP_SENTRY_ENVIRONMENT` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE(_KEY)`, `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_FLOW_ID` |
| Carter | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_MAPS_API_KEY` (referrer-restricted) | Edge Functions: `SERVICE_ROLE_KEY`, TrendiPay API key, `TRENDIPAY_WEBHOOK_SECRET`, `SEND_SMS_HOOK_SECRET`, `ARKESEL_API_KEY`, `ARKESEL_SENDER_ID` |
| Admin | `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY` | Edge Functions: Resend API key, Facebook app secret; Actions: `SUPABASE_SERVICE_ROLE_KEY` |
