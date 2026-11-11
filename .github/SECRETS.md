# GitHub Secrets Configuration for TrashDrop

This document outlines the secrets that need to be configured in the GitHub repository for CI/CD workflows to function properly.

## Required Secrets

Set these secrets in GitHub repository settings (Settings → Secrets → Actions → New repository secret):

| Secret Name | Description | Source |
|-------------|-------------|--------|
| `REACT_APP_SUPABASE_URL` | Supabase project URL | `.env.production` |
| `REACT_APP_SUPABASE_ANON_KEY` | Supabase **publishable** key (`sb_publishable_…`). Legacy JWT keys (`eyJ…`) were disabled on 2026-11-11 and are rejected | Supabase → Settings → API Keys |
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token (of the `tech-admin@` user) for the migrations workflow | Supabase dashboard |

**Environment secrets** (Settings → Environments; one set in `staging`, one in `production`;
see `engineering/runbooks/setup/05-supabase-staging.md`):

| Secret Name | Description |
|-------------|-------------|
| `SUPABASE_PROJECT_ID` | Project ref of that environment's Supabase project |
| `SUPABASE_DB_PASSWORD` | That project's database password |
| `NETLIFY_AUTH_TOKEN` | Authentication token | Netlify account |
| `NETLIFY_SITE_ID` | Site ID for deployment | Netlify dashboard |

## Steps to Generate Required Tokens

### Supabase Access Token
1. Log in to [Supabase Dashboard](https://app.supabase.io/)
2. Click on your profile icon in the bottom left
3. Select "Account"
4. Go to "Access Tokens" section
5. Create a new token with appropriate permissions

### Netlify Auth Token
1. Log in to [Netlify](https://app.netlify.com/)
2. Click on your profile icon
3. Go to "User settings"
4. Select "Applications"
5. Under "Personal access tokens", generate a new token

### Netlify Site ID
1. Go to your site in the Netlify dashboard
2. Navigate to "Site settings"
3. Find the "Site ID" in the "Site information" section

## Security Best Practices

- Never commit these secrets directly to your repository
- Rotate tokens periodically
- Use the minimum required permissions for tokens
- For local development, use `.env.local` (git-ignored) for sensitive values

## Supabase key types (since 2026-11-11)

The production project accepts only the new API keys. The legacy JWT `anon` and
`service_role` keys are **disabled**, so any secret still holding a value that
starts `eyJ` will be rejected and should be replaced:

- Browser apps: `sb_publishable_…`
- Server code (Netlify functions, Edge Functions, GitHub Actions): `sb_secret_…`

See `engineering/runbooks/setup/09-supabase-legacy-keys.md`.
