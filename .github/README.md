# TrashDrop CI/CD Workflows

[![CI/CD](https://github.com/apaloo/TrashDrop-Mobile-User-Domestic/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/apaloo/TrashDrop-Mobile-User-Domestic/actions/workflows/ci-cd.yml)
[![Database Migrations](https://github.com/apaloo/TrashDrop-Mobile-User-Domestic/actions/workflows/supabase-migrations.yml/badge.svg)](https://github.com/apaloo/TrashDrop-Mobile-User-Domestic/actions/workflows/supabase-migrations.yml)

This directory contains GitHub Actions workflow files that automate the testing, building, and deployment processes for the TrashDrop mobile app.

## Available Workflows

### 1. CI/CD Pipeline (`ci-cd.yml`)

This workflow handles the continuous integration and deployment process:

- **Trigger**: Runs on push to `main` branch or any pull request targeting `main`
- **Jobs**:
  - **build-and-test**: Installs dependencies, runs linting, tests, and builds the app
  - **deploy-preview**: Deploys to a preview environment for pull requests
  - **deploy-production**: Deploys to production when changes are merged to `main`

### 2. Database Migrations (`supabase-migrations.yml`)

This workflow manages Supabase database migrations:

- **Trigger**: Runs on push to `main` branch when files in the `migrations/` directory change, or manually
- **Jobs**:
  - **apply-migrations**: Uses Supabase CLI to apply database migrations

## Environment Secrets

The following secrets need to be configured in your GitHub repository settings:

- `REACT_APP_SUPABASE_URL`: Your Supabase project URL
- `REACT_APP_SUPABASE_ANON_KEY`: Your Supabase anonymous key
- `SUPABASE_PROJECT_ID`: Your Supabase project ID
- `SUPABASE_DB_PASSWORD`: Database password for migrations
- `SUPABASE_ACCESS_TOKEN`: Access token for Supabase API

## Local Development

When developing locally, the application uses the environment variables defined in `.env.development` for development and testing.

## Responsive UI Testing

The CI process includes testing for our responsive navigation system:
- Mobile view: Bottom navigation bar with Dashboard, Scan QR, Request Pickup, and Report Dumping
- Desktop view: Traditional horizontal navbar

## Adding New Migrations

To add new database migrations:
1. Create a new SQL file in the `migrations/` directory with a sequential prefix (e.g., `02_add_new_feature.sql`)
2. Push to GitHub or run the workflow manually
