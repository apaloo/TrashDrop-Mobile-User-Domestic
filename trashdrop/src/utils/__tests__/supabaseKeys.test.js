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
