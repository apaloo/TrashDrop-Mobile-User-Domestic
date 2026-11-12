# TrashDrop Mobile App

[![CI/CD](https://github.com/apaloo/TrashDrop-Mobile-User-Domestic/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/apaloo/TrashDrop-Mobile-User-Domestic/actions/workflows/ci-cd.yml)
[![Database Migrations](https://github.com/apaloo/TrashDrop-Mobile-User-Domestic/actions/workflows/supabase-migrations.yml/badge.svg)](https://github.com/apaloo/TrashDrop-Mobile-User-Domestic/actions/workflows/supabase-migrations.yml)
[![Netlify Status](https://api.netlify.com/api/v1/badges/9f7ad4f6-5c98-4a73-9c87-a2e0ef50fef8/deploy-status)](https://trashdrop-mobile.windsurf.build)

This repository contains the TrashDrop mobile application, a progressive web app (PWA) for waste pickup scheduling and management.

## Features

- **PWA Support**: Works offline and can be installed on mobile devices
- **Responsive Navigation**:
  - Mobile: Top navbar with logo and profile dropdown + bottom navigation bar
  - Desktop: Traditional horizontal navbar
- **Waste Management**:
  - Digital Bin
  - Report illegal dumping
  - Scan QR codes for batch of bags purchased
  - Track activity and rewards

## Live Demo

The production application is deployed at: [https://trashdrop-mobile.windsurf.build](https://trashdrop-mobile.windsurf.build)

## Repository layout

| Folder | What it is |
|---|---|
| `trashdrop/` | The household app (React PWA), its Netlify functions (WhatsApp booking) and the database migrations (`trashdrop/supabase/`) |
| `engineering/` | The engineering handbook: policies, runbooks, registers, onboarding |
| `docs/` | Product rules (`DIGITAL_BIN_PRICING.md`, `POINTS.md`, `COLLECTOR_PAYOUTS.md`) and the archive of old notes |
| `.github/` | CI, security checks, automation, templates |

New engineers: start with [`engineering/onboarding.md`](engineering/onboarding.md).

## Development

All commands run in `trashdrop/` (`cd trashdrop` first).

Built with [Vite](https://vite.dev) (`vite.config.mjs`); it moved from Create
React App and craco in November 2026 (TD12). The code keeps Create React App's
conventions: `process.env.REACT_APP_*` variables, JSX in `.js` files, output
in `build/`.

Every `REACT_APP_*` variable ships to every visitor's browser. Never put a
secret in one: the build refuses to run if one holds a Supabase service role
or secret key, a private key, or has SECRET, SERVICE_ROLE, PRIVATE_KEY,
PASSWORD or BEARER in its name (`scripts/env-guard.cjs`).

| Command | What it does |
|---|---|
| `npm start` | Development server at http://localhost:3000 (`PORT=3010 npm start` for `netlify dev`). Requests to `/.netlify/functions/` go to `netlify functions:serve` on port 9999. |
| `npm test` | Jest in watch mode (`jest.config.js`, the same set-up Create React App used). |
| `npm run test:ci` | Every suite once, as CI runs it. |
| `npm run lint` | ESLint (`react-app` rules). |
| `npm run build` | Production build in `build/`: hashed files in `build/static/`, and the offline service worker `build/service-worker.js` built from `src/service-worker.js` with the precache list injected (TD8). |
| `npm run preview` | Serves `build/` locally. |

The pricing guard tests run in CI on every pull request:
`npx jest --ci src/services/__tests__/digitalBinService.promotion.test.js` and
`node netlify/functions/__checks__/pricing-promo.js`.
