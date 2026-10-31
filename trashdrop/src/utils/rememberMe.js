/**
 * "Remember me" on the sign-in page.
 *
 * Ticked (the default): the app keeps you signed in, as it always has, and
 * fills in your email next time.
 * Not ticked: you stay signed in while the app is open (reloads included),
 * and are signed out the next time you open it after closing it; your email
 * is not kept.
 *
 * How: signing in without "Remember me" sets a flag; each open of the app
 * (each browser tab or app window) marks itself in sessionStorage, which the
 * browser clears when the app or tab is closed. When the app starts with the
 * flag set and no mark, the stored session is from an earlier visit, so it is
 * removed before Supabase reads it.
 */

export const SESSION_ONLY_KEY = 'trashdrop_session_only';
export const SESSION_ACTIVE_KEY = 'trashdrop_session_active';
export const REMEMBERED_EMAIL_KEY = 'trashdrop_remembered_email';

const isAuthKey = (key) =>
  (key.startsWith('sb-') && key.endsWith('-auth-token')) ||
  key === 'trashdrop_auth_token' ||
  key === 'trashdrop_user';

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/** Call when signing in: remember (or not) the session and the email. */
export const applyRememberMe = (remember, email) => safe(() => {
  if (remember) {
    localStorage.removeItem(SESSION_ONLY_KEY);
    if (email) localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
  } else {
    localStorage.setItem(SESSION_ONLY_KEY, '1');
    localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  }
  sessionStorage.setItem(SESSION_ACTIVE_KEY, '1');
}, undefined);

/**
 * Call once when the app starts, before Supabase reads the stored session.
 * Returns true when it signed out a session that was not to be remembered.
 */
export const endSessionIfNotRemembered = () => safe(() => {
  const sessionOnly = localStorage.getItem(SESSION_ONLY_KEY) === '1';
  const stillOpen = sessionStorage.getItem(SESSION_ACTIVE_KEY) === '1';
  sessionStorage.setItem(SESSION_ACTIVE_KEY, '1');
  if (!sessionOnly || stillOpen) return false;
  // The flag stays, so the sign-in page shows the box as the person left it
  Object.keys(localStorage).filter(isAuthKey).forEach(key => localStorage.removeItem(key));
  return true;
}, false);

/** What the sign-in page starts with: the remembered email and the box state. */
export const rememberedSignIn = () => safe(() => ({
  email: localStorage.getItem(REMEMBERED_EMAIL_KEY) || '',
  remember: localStorage.getItem(SESSION_ONLY_KEY) !== '1',
}), { email: '', remember: true });
