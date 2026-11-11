/**
 * Error monitoring (Sentry).
 *
 * Off unless REACT_APP_SENTRY_DSN is set at build time, so local development,
 * tests and builds without the variable behave exactly as before.
 * Setup: engineering/runbooks/setup/06-sentry.md
 *
 * Privacy (engineering/policies/data-protection-controls.md): no default PII,
 * no IP addresses, no request bodies or form values, and phone/MoMo-like
 * numbers and emails are masked in messages before sending.
 */
import * as Sentry from '@sentry/react';

const DSN = process.env.REACT_APP_SENTRY_DSN;
let enabled = false;

// Ghana phone / MoMo numbers (0XXXXXXXXX, +233XXXXXXXXX, 233XXXXXXXXX), any
// other run of 9+ digits, and email addresses.
const PHONE_LIKE = /(\+?233|0)\d{9}\b|\b\d{9,}\b/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function scrub(text) {
  if (typeof text !== 'string') return text;
  return text.replace(EMAIL, '[email]').replace(PHONE_LIKE, '[number]');
}

export function scrubEvent(event) {
  if (!event) return event;
  if (event.message) event.message = scrub(event.message);
  (event.exception?.values || []).forEach((v) => { v.value = scrub(v.value); });
  (event.breadcrumbs || []).forEach((b) => { b.message = scrub(b.message); });
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.url) event.request.url = scrub(event.request.url);
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  return event;
}

export function initMonitoring() {
  if (!DSN || enabled) return false;
  Sentry.init({
    dsn: DSN,
    environment: process.env.REACT_APP_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    release: process.env.REACT_APP_VERSION || undefined,
    sendDefaultPii: false,
    // Errors only for now; performance tracing can be added once the
    // free-tier volume is understood.
    tracesSampleRate: 0,
    // Noise from browser extensions and flaky mobile networks.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
    ],
    beforeSend: scrubEvent,
    beforeBreadcrumb(breadcrumb) {
      // Keep navigation and errors; drop console noise and input values.
      if (breadcrumb.category === 'console' && breadcrumb.level !== 'error') return null;
      if (breadcrumb.category === 'ui.input') return null;
      breadcrumb.message = scrub(breadcrumb.message);
      return breadcrumb;
    },
  });
  enabled = true;
  // One-off check after setup (runbook 06): run in the browser console.
  window.__trashdropSentryTest = () => Sentry.captureMessage('TrashDrop Sentry test event');
  return true;
}

/** Record an error caught by an error boundary or a catch block. */
export function captureError(error, context) {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context?.componentStack) scope.setContext('react', { componentStack: context.componentStack });
    if (context?.tags) Object.entries(context.tags).forEach(([k, v]) => scope.setTag(k, v));
    Sentry.captureException(error);
  });
}

/** Attach the signed-in user's id (never email or phone). Pass null on sign-out. */
export function setMonitoringUser(userId) {
  if (!enabled) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

export function isMonitoringEnabled() {
  return enabled;
}
