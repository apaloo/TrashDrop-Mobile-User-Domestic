/**
 * Supabase API key formats the browser app accepts.
 *
 * Supabase now issues non-JWT keys alongside the legacy JWT ones:
 *   eyJ...              legacy anon key (a JWT)            - fine in the browser
 *   sb_publishable_...  new publishable key                - fine in the browser
 *   sb_secret_...       new secret key (service-role level) - must never ship to a browser
 *
 * Accepting only "eyJ" took the whole app down when the Netlify build switched
 * to a publishable key.
 */

/**
 * @param {string} key - REACT_APP_SUPABASE_ANON_KEY
 * @returns {string|null} what is wrong with the key, or null when it is usable
 */
export const supabaseBrowserKeyProblem = (key) => {
  if (!key || typeof key !== 'string') return 'missing';
  if (key.startsWith('sb_secret_')) {
    return 'is a secret key; use the anon or publishable key in the browser';
  }
  if (key.startsWith('eyJ') || key.startsWith('sb_publishable_')) return null;
  return 'is not an anon (eyJ...) or publishable (sb_publishable_...) key';
};

// The production project (public: it is in every API address)
export const PRODUCTION_PROJECT_REF = 'tfdedlqdsajjdjkerkli';

/**
 * Where the signed-in session is kept in the browser.
 *
 * supabase-js names it after the first part of the API address:
 * https://<ref>.supabase.co gives "sb-<ref>-auth-token". On a custom domain
 * (https://auth.trashdrops.com, so Google sign-in shows TrashDrop's address
 * instead of Supabase's) that would become "sb-auth-auth-token" and sign
 * everyone out once. Keep the project's own name instead: from the
 * *.supabase.co address, else REACT_APP_SUPABASE_PROJECT_REF, else production.
 *
 * @param {string} url - REACT_APP_SUPABASE_URL
 * @param {string} [projectRef] - REACT_APP_SUPABASE_PROJECT_REF
 */
export const authStorageKey = (url, projectRef) => {
  let ref = null;
  try {
    const host = new URL(url).hostname;
    if (host.endsWith('.supabase.co')) ref = host.split('.')[0];
  } catch {
    // not a URL: fall through
  }
  return `sb-${ref || projectRef || PRODUCTION_PROJECT_REF}-auth-token`;
};

export default { supabaseBrowserKeyProblem, authStorageKey };
