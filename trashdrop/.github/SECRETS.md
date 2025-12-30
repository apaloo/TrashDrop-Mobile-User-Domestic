# GitHub Secrets Configuration for TrashDrop

This document outlines the secrets that need to be configured in the GitHub repository for CI/CD workflows to function properly.

## Required Secrets

Set these secrets in GitHub repository settings (Settings → Secrets → Actions → New repository secret):

| Secret Name | Description | Source |
|-------------|-------------|--------|
| `REACT_APP_SUPABASE_URL` | Supabase project URL | `.env.production` |
| `REACT_APP_SUPABASE_ANON_KEY` | Supabase anonymous key | `.env.production` |
| `SUPABASE_PROJECT_ID` | Supabase project ID (subdomain part of URL) | Extract from Supabase URL |
| `SUPABASE_DB_PASSWORD` | Database password | Supabase dashboard |
| `SUPABASE_ACCESS_TOKEN` | Access token | Supabase dashboard |
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
