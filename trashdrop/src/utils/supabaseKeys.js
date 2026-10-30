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

export default { supabaseBrowserKeyProblem };
