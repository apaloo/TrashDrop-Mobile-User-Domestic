# 06 · Sentry error tracking

**Who:** owner signs up; engineer wires each app · **Time:** 1 hour · **Cost:** free Developer plan to start; Team plan as volume grows

## Account

1. Sign up at sentry.io with `tech-admin@`. Organisation: `trashdrop`.
   Data region: EU.
2. Settings → Security & Privacy: **Require 2FA**; turn **on** *Data
   scrubber*, *Use default scrubbers*, and *Prevent storing of IP addresses*.
3. Create projects (platform *React*): `household-app`, `carter-app`, `admin-portal`.
4. Alerts → create rules: "A new issue is created" → email `alerts@`;
   "Error count > 50 in 1 h" → email `alerts@`.

## Household app (already wired)

The code is in `trashdrop/src/utils/monitoring.js` and does nothing until a DSN is set.

1. Sentry → `household-app` → Settings → Client Keys → copy the **DSN**.
   A DSN is safe to ship in the browser.
2. Netlify → household site → Environment variables:
   - `REACT_APP_SENTRY_DSN` = the DSN (Production context, and Deploy previews if wanted)
   - `REACT_APP_SENTRY_ENVIRONMENT` = `production` (or `preview`)
3. Redeploy. Confirm that an event arrives: open the site, run
   `window.__trashdropSentryTest?.()` in the browser console, and check Sentry.

## Carter app (Vite) and admin portal (CRA)

Copy `trashdrop/src/utils/monitoring.js` into each app:

- In the carter app, read `import.meta.env.VITE_SENTRY_DSN` instead of `process.env.REACT_APP_SENTRY_DSN`.
- Call `initMonitoring()` first thing in `main.jsx` / `index.js`.
- Call `captureError` from the existing `ErrorBoundary` (the carter app has a "Future: send to Sentry" comment at `src/components/ErrorBoundary.jsx`).
- Run `npm install @sentry/react` in each app.
