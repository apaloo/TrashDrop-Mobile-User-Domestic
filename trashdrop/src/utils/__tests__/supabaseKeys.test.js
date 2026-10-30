import { supabaseBrowserKeyProblem } from '../supabaseKeys.js';

describe('supabaseBrowserKeyProblem', () => {
  it('accepts a legacy anon JWT', () => {
    expect(supabaseBrowserKeyProblem('eyJhbGciOiJIUzI1NiJ9.e30.sig')).toBeNull();
  });

  it('accepts a new publishable key', () => {
    expect(supabaseBrowserKeyProblem('sb_publishable_AbC123')).toBeNull();
  });

  it('refuses a secret key, which must never reach a browser', () => {
    expect(supabaseBrowserKeyProblem('sb_secret_AbC123')).toMatch(/secret key/);
  });

  it('refuses a missing or unrecognised key', () => {
    expect(supabaseBrowserKeyProblem(undefined)).toBe('missing');
    expect(supabaseBrowserKeyProblem('not-a-key')).toMatch(/not an anon/);
  });
});

describe('authStorageKey', () => {
  const { authStorageKey } = require('../supabaseKeys');
  it('keeps the project name on the *.supabase.co address', () => {
    expect(authStorageKey('https://tfdedlqdsajjdjkerkli.supabase.co')).toBe('sb-tfdedlqdsajjdjkerkli-auth-token');
    expect(authStorageKey('https://abcdefghijklmnopqrst.supabase.co', 'other')).toBe('sb-abcdefghijklmnopqrst-auth-token');
  });
  it('keeps the same name on a custom domain, so no one is signed out', () => {
    expect(authStorageKey('https://auth.trashdrops.com')).toBe('sb-tfdedlqdsajjdjkerkli-auth-token');
    expect(authStorageKey('https://auth.trashdrops.com', 'abcdefghijklmnopqrst')).toBe('sb-abcdefghijklmnopqrst-auth-token');
  });
});
