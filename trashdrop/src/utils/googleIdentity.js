/**
 * "Sign in with Google" through Google's own button (Google Identity
 * Services) instead of a redirect through Supabase.
 *
 * The redirect sends people to Google with Supabase's address as the place
 * to return to, so Google says "Sign in to tfdedlqdsajjdjkerkli.supabase.co".
 * With Google's button the sign-in happens on app.trashdrops.com, so Google
 * shows TrashDrop (by name and logo once Google has verified the brand), and
 * the app hands Google's ID token to Supabase (signInWithIdToken).
 *
 * Needs REACT_APP_GOOGLE_CLIENT_ID (the Google OAuth Web client ID, public)
 * whose Authorised JavaScript origins include the app's address, and the same
 * client ID allowed in Supabase's Google provider. Without it the app keeps
 * the redirect.
 */

export const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
let loading = null;

/** Loads Google's sign-in script once; resolves to window.google.accounts.id */
export const loadGoogleIdentity = () => {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in did not load')));
      script.onerror = () => { loading = null; reject(new Error('Google sign-in could not load')); };
      document.head.appendChild(script);
    });
  }
  return loading;
};

const hex = (buffer) => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');

/**
 * A one-time value tying Google's token to this sign-in: Google gets the
 * SHA-256 of it, Supabase gets the value itself and checks they match.
 */
export const makeNonce = async () => {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  const raw = hex(bytes);
  const hashed = hex(await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
  return { raw, hashed };
};
