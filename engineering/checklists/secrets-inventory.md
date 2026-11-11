# Secrets inventory

Every credential the platform uses: **names and locations only, never values**.
Move each one into Bitwarden ([runbook 04](../runbooks/setup/04-password-manager.md)),
then delete the old copies and tick both boxes in a pull request.
Re-check this list at each quarterly access review.

**P** = Production secrets collection · **S** = Shared accounts and operations collection

## Database and hosting

| Secret | Used by | Configured in | Collection | In Bitwarden | Old copies deleted | Last rotated |
|---|---|---|---|---|---|---|
| Supabase `sb_secret_…` key (production) | Edge Functions (auto-injected), household Netlify functions, admin GitHub Action | Netlify env (household), GitHub secret `SUPABASE_SERVICE_ROLE_KEY` (admin) | P | ☐ | ☐ | 2026-11 |
| Supabase `sb_publishable_…` key | All three apps (public by design) | Netlify env, `.env.development` (admin) | S | ☐ | n/a | 2026-11 |
| Supabase database password (production) | Migrations workflow, backups | GitHub environment `production` | P | ☐ | ☐ | |
| Supabase personal access token | Migrations workflow, security watch | GitHub secret `SUPABASE_ACCESS_TOKEN` | P | ☐ | ☐ | |
| Supabase dashboard login (owner) | People | n/a | P | ☐ | n/a | |
| Netlify personal access token | Household CI deploys | GitHub secret `NETLIFY_AUTH_TOKEN` | P | ☐ | ☐ | |
| Netlify dashboard login | People | n/a | P | ☐ | n/a | |
| GitHub `ENGINEERING_REPORT_TOKEN` (read-only) | Monthly report | GitHub secret | P | ☐ | n/a | |
| Domain registrar login (trashdrops.com) | People | n/a | P | ☐ | n/a | |

## Payments

| Secret | Used by | Configured in | Collection | In Bitwarden | Old copies deleted | Last rotated |
|---|---|---|---|---|---|---|
| TrendiPay API key | `trendipay-proxy` Edge Function | Supabase Edge Function secrets | P | ☐ | ☐ | |
| `TRENDIPAY_WEBHOOK_SECRET` | TrendiPay webhooks | Supabase Edge Function secrets | P | ☐ | ☐ | |
| TrendiPay merchant dashboard login | Finance | n/a | P | ☐ | n/a | |

## Messaging and email

| Secret | Used by | Configured in | Collection | In Bitwarden | Old copies deleted | Last rotated |
|---|---|---|---|---|---|---|
| `META_ACCESS_TOKEN` (WhatsApp Cloud API) | WhatsApp booking | Netlify env (household) | P | ☐ | ☐ | |
| `META_APP_SECRET` | WhatsApp webhook signature check | Netlify env (household) | P | ☐ | ☐ | |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp webhook set-up | Netlify env (household) | P | ☐ | ☐ | |
| Meta Business / WhatsApp Manager login | People | n/a | P | ☐ | n/a | |
| Resend API key | Admin email Edge Functions | Supabase Edge Function secrets | P | ☐ | ☐ | |
| Edge Function shared secret for pg_net email calls | Database → email functions | Supabase Vault | P | ☐ | n/a | |

## Maps, social and other services

| Secret | Used by | Configured in | Collection | In Bitwarden | Old copies deleted | Last rotated |
|---|---|---|---|---|---|---|
| Google Maps API key (browser, referrer-restricted) | Carter and household apps | Netlify env `VITE_GOOGLE_MAPS_API_KEY` | S | ☐ | ☐ | **rotate (TD27)** |
| Google Cloud console login | People | n/a | P | ☐ | n/a | |
| Facebook app secret / page token | Admin `facebook-feed` function | Supabase Edge Function secrets | P | ☐ | ☐ | |
| Sentry DSNs (public by design) | Three apps | Netlify env | S | ☐ | n/a | |
| Sentry, Better Stack logins | People | n/a | S | ☐ | n/a | |

## Operations

| Item | Collection | In Bitwarden |
|---|---|---|
| Contact sheet: on-call phone, escalation order, vendor support numbers (business continuity plan) | S | ☐ |
| Test accounts for each app (household, carter, admin staff) | S | ☐ |

## Never in Bitwarden *and* anywhere else

After moving an item, search for leftover copies and delete them:
laptop `.env` files, notes apps, WhatsApp and email threads, and documents.
A secret found in git (the secret scan will flag it) must be **rotated**,
not just deleted.
