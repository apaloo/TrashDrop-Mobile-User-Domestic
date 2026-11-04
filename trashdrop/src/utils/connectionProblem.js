/**
 * Tells a sign-in that failed because of the connection apart from one the
 * account refused, and words it for the person: what happened and what to do.
 */

// A sign-in that hangs this long on a weak signal is reported, not left spinning
export const SIGN_IN_TIMEOUT_MS = 15000;

export const CONNECTION_MESSAGES = {
  offline: {
    title: "You're offline",
    message: "Connect to Wi-Fi or mobile data. We'll sign you in as soon as you're back online.",
  },
  unreachable: {
    title: "Couldn't reach TrashDrop",
    message: 'Your connection dropped before we could finish. Check your signal and try again.',
  },
  slow: {
    title: 'Your connection is slow',
    message: 'That took too long. Try again, or move to a stronger signal.',
  },
  server: {
    title: 'TrashDrop is busy',
    message: "It isn't your connection: our server didn't answer. Try again in a minute.",
  },
};

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * 'offline' | 'unreachable' | 'slow' | 'server', or null when the failure is
 * not about the connection (wrong password, unconfirmed email, ...).
 */
export const connectionProblem = (error) => {
  if (isOffline()) return 'offline';
  if (!error) return null;
  if (error.code === 'SIGN_IN_TIMEOUT' || /request timeout/i.test(String(error.message || ''))) return 'slow';
  // Supabase auth: status 0 when the request never got an answer, 502-504 when the server failed
  if (error.name === 'AuthRetryableFetchError') return error.status ? 'server' : 'unreachable';
  // Chrome, Safari and Firefox word a dropped request differently
  const text = String(error.message || '');
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(text)) return 'unreachable';
  return null;
};

/** Rejects with a SIGN_IN_TIMEOUT error when the promise takes longer than ms */
export const withTimeout = (promise, ms = SIGN_IN_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const timeout = new Error('Sign-in timed out');
      timeout.code = 'SIGN_IN_TIMEOUT';
      reject(timeout);
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
