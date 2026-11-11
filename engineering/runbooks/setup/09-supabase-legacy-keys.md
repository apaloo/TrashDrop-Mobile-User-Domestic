# 09 · Supabase key clean-up after rotation

**Who:** owner (Supabase organisation owner) · **Time:** 30 minutes plus testing

The production keys exposed in git history have been rotated. This runbook
finishes the job without breaking the apps.

## Which keys do you have?

Supabase dashboard → production project → **Project Settings → API Keys**.

- **New-style keys**: `sb_publishable_…` (browser) and `sb_secret_…` (server).
- **Legacy JWT keys**: `anon` and `service_role` (long strings starting
  `eyJ`), signed by the project's JWT secret.

## Case 1: you created new `sb_secret_…` / `sb_publishable_…` keys

1. Check that every consumer uses the **new** keys. Until each one is switched, it
   still works only because legacy keys are on.

   | Consumer | Where the key is set |
   |---|---|
   | Household app (browser) | Netlify → household site → `REACT_APP_SUPABASE_ANON_KEY` (accepts `sb_publishable_…`) |
   | Household Netlify functions (WhatsApp) | Netlify → household site → `SUPABASE_SERVICE_ROLE` or `SUPABASE_SERVICE_ROLE_KEY` (read by `netlify/functions/utils/supabase-admin.js`) |
   | Carter app (browser) | Netlify → carter site → `VITE_SUPABASE_ANON_KEY` |
   | Carter Edge Functions (TrendiPay) | Supabase → Edge Functions → Secrets → `SERVICE_ROLE_KEY` |
   | Admin portal (browser) | Netlify → admin site → `REACT_APP_SUPABASE_ANON_KEY` |
   | Admin Edge Functions (emails) | Supabase → Edge Functions → Secrets |
   | Admin hourly area-name backfill | GitHub → admin repository → Actions secrets → `SUPABASE_SERVICE_ROLE_KEY` |
   | Database migrations workflow | GitHub environments (runbook 05) |
   | Database webhooks / pg_net calls | Supabase → Database → Webhooks; Vault secrets |

2. Redeploy each Netlify site and test sign-in, a QR scan, a Digital Bin
   request and a carter withdrawal status check.
3. **Delete the old secret key**: API Keys → the old `sb_secret_…` → ⋯ → Delete.
4. When nothing uses legacy keys any more: API Keys → **Legacy API keys →
   Disable**. Watch Sentry and the uptime monitors for one hour. If anything
   breaks, re-enable them; disabling can be undone.

## Case 2: you rotated the legacy JWT secret

Generating a new JWT secret invalidates **every** old `anon` and
`service_role` key immediately. There is nothing left to delete; the leaked
keys are already dead. Make sure every consumer in the table above has the new
values. Plan the move to new-style keys (Case 1) in the next month, because
those can be rotated one at a time without signing everyone out.

## Afterwards

- Check **Logs → API** for requests made with the `service_role` key from unknown
  IP addresses during the exposure period. Record the result in the restricted
  incident issue.
- Record the rotation date in the [infrastructure register](../../registers/infrastructure.md).
- History rewriting (removing the old key from git history) is optional once the
  key is dead and the repositories are private. It would break every existing clone, so only do it with the whole team.
