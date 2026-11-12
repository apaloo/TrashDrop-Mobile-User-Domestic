# A secret in git history

**When:** the *History secret scan* workflow fails, or anyone finds a key,
token, password or private key in any commit of the household, carter or
admin repository.
**Who:** Technical Lead; the owner revokes keys only they can reach.

All three repositories are public. A secret that was ever committed has been
published, even if a later commit deleted it: deleting the file does not help.
Treat it as live until it is revoked where it was issued.

## 1. Find it, privately

Do not paste the secret, or where it is, into an issue, pull request, commit
message or chat that others can read.

```bash
# full clones of the repository the workflow named
gitleaks git <path-to-clone> --config .gitleaks.toml --report-format json --report-path /tmp/report.json --exit-code 0
node engineering/automation/history-secret-scan.mjs --hash <household|collector|admin> /tmp/report.json
```

`--hash` prints each finding's hash, rule, file and commit. The new finding is
the one whose hash is not in `history-secret-scan-baseline.json`. Keep notes
in the restricted incident file.

## 2. Decide what it is

| Decision | Means | Action |
|---|---|---|
| `awaiting-revocation` | A real secret | Revoke it now (step 3) |
| `revoked` | A real secret that no longer works | Nothing more |
| `public-by-design` | Meant to be public: a Supabase `anon` or `sb_publishable_` key | Nothing |
| `dev-only` | Only ever used on a developer machine | Nothing |
| `not-a-secret` | Placeholder, test value, identifier | Nothing |

When unsure, it is a real secret.

## 3. Revoke a real secret

Revoke it where it was issued, then replace it everywhere it is used:

| Secret | Where to revoke |
|---|---|
| Supabase `sb_secret_` key | Project Settings → API Keys → delete the key |
| Supabase `service_role` or `anon` JWT | Project Settings → JWT Keys: create a standby key, rotate, wait for access tokens to expire (1 hour 15 minutes), then revoke the old secret |
| Meta (Facebook, WhatsApp) token | Meta for Developers → the app → revoke the token, or reset the app secret |
| Google Maps key | Google Cloud → Credentials → regenerate, and restrict it to the app domains |
| TrendiPay, Resend, others | The provider's dashboard |

Check the provider's logs for use of the secret since it was committed.

## 4. Record the decision

Add the hash to `engineering/automation/history-secret-scan-baseline.json`
with its decision, in a pull request that says only "reviewed history scan
findings". When the owner revokes a secret marked `awaiting-revocation`,
change it to `revoked`. The workflow reports how many are still waiting.

Rewriting history to remove a revoked secret is optional: it breaks every
existing clone and fork, and the secret is already public.
