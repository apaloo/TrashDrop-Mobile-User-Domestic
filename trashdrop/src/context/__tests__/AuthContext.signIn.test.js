// Signing in, signing up, signing out and password reset, through the real
// AuthProvider with Supabase mocked: what each answer from Supabase turns into
// for the household, and what is kept on (or cleared from) the phone.
import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext.js';
import supabase from '../../utils/supabaseClient.js';

jest.mock('../../utils/supabaseClient.js', () => ({
  __esModule: true,
  default: {
    auth: {
      getSession: jest.fn(),
      refreshSession: jest.fn(),
      signOut: jest.fn(),
      onAuthStateChange: jest.fn(),
      signInWithPassword: jest.fn(),
      setSession: jest.fn(),
      signUp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      resend: jest.fn(),
      signInWithOAuth: jest.fn(),
      signInWithIdToken: jest.fn(),
    },
  },
}));
jest.mock('../../utils/errorLogger.js', () => ({
  logAuthError: jest.fn(),
  ERROR_CATEGORIES: { AUTH: 'auth', NETWORK: 'network' },
}));
jest.mock('../../utils/performanceMonitor.js', () => ({ __esModule: true, default: {} }));
jest.mock('../../utils/siteUrl.js', () => ({ getSiteUrl: () => 'https://app.trashdrops.com' }));

const USER = { id: 'u1', email: 'ama@example.com', user_metadata: { first_name: 'Ama' }, identities: [{ id: 'i1' }] };
const SESSION = { access_token: 'access-1', refresh_token: 'refresh-1', user: USER };

let auth;
const Probe = () => { auth = useAuth(); return <p>status: {auth.status}</p>; };
const mount = async () => {
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(auth.status).not.toBe('LOADING'));
};
const call = async (fn) => { let r; await act(async () => { r = await fn(); }); return r; };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.matchMedia = jest.fn(() => ({ matches: false, addListener: jest.fn(), removeListener: jest.fn() }));
  Object.values(supabase.auth).forEach((f) => f.mockReset());
  supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  supabase.auth.signOut.mockResolvedValue({ error: null });
  supabase.auth.setSession.mockResolvedValue({ data: {}, error: null });
  supabase.auth.onAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: jest.fn() } } }));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('signIn', () => {
  it('signs in, keeps the user and token on the phone, and says so', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: USER, session: SESSION }, error: null });
    await mount();
    const r = await call(() => auth.signIn('ama@example.com', 'secret'));
    expect(r).toMatchObject({ success: true, user: USER, session: SESSION });
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ama@example.com', password: 'secret' });
    expect(auth.status).toBe('AUTHENTICATED');
    expect(JSON.parse(localStorage.getItem('trashdrop_user'))).toMatchObject({ id: 'u1', email: 'ama@example.com', remember_me: false });
    expect(localStorage.getItem('trashdrop_auth_token')).toBe('access-1');
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it('"stay signed in" hands the session to Supabase to keep', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: USER, session: SESSION }, error: null });
    await mount();
    await call(() => auth.signIn('ama@example.com', 'secret', true));
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'access-1', refresh_token: 'refresh-1' });
    expect(JSON.parse(localStorage.getItem('trashdrop_user')).remember_me).toBe(true);
  });

  it.each([
    ['Invalid login credentials', /Invalid email or password/],
    ['Email not confirmed', /verify your email address/],
    ['User not found', /No account found/],
    ['Email rate limit exceeded', /Too many login attempts/],
    ['AuthApiError: email_not_confirmed', /verify your email address/],
    ['invalid grant', /Invalid email or password/],
  ])('Supabase says "%s": the household is told plainly and nothing is kept', async (message, expected) => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: null, error: { message, code: 'x' } });
    await mount();
    const r = await call(() => auth.signIn('ama@example.com', 'wrong'));
    expect(r.success).toBe(false);
    expect(r.error.message).toMatch(expected);
    expect(r.error.originalMessage).toBe(message);
    expect(auth.status).toBe('ERROR');
    expect(localStorage.getItem('trashdrop_user')).toBeNull();
    expect(localStorage.getItem('trashdrop_auth_token')).toBeNull();
  });

  it('another message from Supabase reaches the household as it is', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: null, error: { message: 'Signups not allowed for this instance' } });
    await mount();
    const r = await call(() => auth.signIn('ama@example.com', 'x'));
    expect(r.error).toMatchObject({ message: 'Signups not allowed for this instance', code: 'SIGN_IN_ERROR' });
  });

  it('a connection failure is reported as one, never as a wrong password', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: null, error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } });
    await mount();
    const r = await call(() => auth.signIn('ama@example.com', 'secret'));
    expect(r.success).toBe(false);
    expect(r.error.code).toBe('NETWORK_ERROR');
    expect(r.error.message).not.toMatch(/password/i);
  });

  it('an answer without a session is not a sign-in', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: USER, session: null }, error: null });
    await mount();
    const r = await call(() => auth.signIn('ama@example.com', 'secret'));
    expect(r).toEqual({ success: false, error: { message: 'Invalid response from authentication server', code: 'INVALID_RESPONSE' } });
    expect(auth.status).toBe('ERROR');
    expect(localStorage.getItem('trashdrop_user')).toBeNull();
  });

  it('an unexpected throw is caught and reported', async () => {
    supabase.auth.signInWithPassword.mockRejectedValue(new Error('boom'));
    await mount();
    const r = await call(() => auth.signIn('ama@example.com', 'secret'));
    expect(r).toEqual({ success: false, error: { message: 'boom', code: 'UNEXPECTED_ERROR' } });
  });
});

describe('signUp', () => {
  it('sends the details and the confirmation link back to our own site', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: USER, session: null }, error: null });
    await mount();
    const r = await call(() => auth.signUp('ama@example.com', 'secret', { first_name: 'Ama' }));
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'ama@example.com', password: 'secret',
      options: { data: { first_name: 'Ama' }, emailRedirectTo: 'https://app.trashdrops.com/auth/callback' },
    });
    expect(r).toMatchObject({ success: true, needsEmailConfirmation: true });
    expect(auth.status).toBe('UNAUTHENTICATED'); // waiting for the email link
  });

  it('signed in at once when Supabase returns a session', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: USER, session: SESSION }, error: null });
    await mount();
    const r = await call(() => auth.signUp('ama@example.com', 'secret', {}));
    expect(r).toMatchObject({ success: true, needsEmailConfirmation: false });
    expect(auth.status).toBe('AUTHENTICATED');
  });

  it('an address already registered is told so (Supabase answers with no identities and no error)', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: { ...USER, identities: [] }, session: null }, error: null });
    await mount();
    const r = await call(() => auth.signUp('ama@example.com', 'secret', {}));
    expect(r).toEqual({ success: false, error: { message: 'User already registered', code: 'USER_EXISTS' } });
    expect(auth.status).toBe('UNAUTHENTICATED');
  });

  it('an error from Supabase is not a success', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: {}, error: { message: 'Password should be at least 6 characters' } });
    await mount();
    const r = await call(() => auth.signUp('ama@example.com', '1', {}));
    expect(r.success).toBe(false);
  });
});

describe('signOut', () => {
  it('signs this phone out and clears the session, the stored user and the household caches', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: USER, session: SESSION }, error: null });
    await mount();
    await call(() => auth.signIn('ama@example.com', 'secret'));
    localStorage.setItem('sb-test-auth-token', '{}');
    localStorage.setItem('digitalBins', '[{"id":"b1","user_id":"u1"}]');
    localStorage.setItem('qr_b1', 'data:image/png;base64,AAA');
    localStorage.setItem('trashdrop_theme', 'dark');
    sessionStorage.setItem('anything', '1');

    const r = await call(() => auth.signOut());
    expect(r).toEqual({ success: true });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(auth.status).toBe('UNAUTHENTICATED');
    expect(auth.user).toBeNull();
    for (const k of ['trashdrop_user', 'trashdrop_auth_token', 'sb-test-auth-token', 'digitalBins', 'qr_b1']) expect(localStorage.getItem(k)).toBeNull();
    expect(localStorage.getItem('trashdrop_theme')).toBe('dark'); // a setting, not the household's data
    expect(sessionStorage.length).toBe(0);
  });

  it('clears the phone even when Supabase cannot be reached', async () => {
    supabase.auth.signOut.mockRejectedValue(new Error('Failed to fetch'));
    localStorage.setItem('trashdrop_user', '{"id":"u1"}');
    localStorage.setItem('digitalBins', '[]');
    await mount();
    const r = await call(() => auth.signOut({ scope: 'global' }));
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(r).toEqual({ success: true });
    expect(localStorage.getItem('trashdrop_user')).toBeNull();
    expect(localStorage.getItem('digitalBins')).toBeNull();
  });
});

describe('resetPassword', () => {
  it('sends the reset link back to our own site', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await mount();
    await expect(call(() => auth.resetPassword('ama@example.com'))).resolves.toEqual({ success: true });
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('ama@example.com', { redirectTo: 'https://app.trashdrops.com/reset-password-confirm' });
  });

  it('a refusal or a throw is reported, not hidden', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValueOnce({ error: { message: 'Email rate limit exceeded' } });
    await mount();
    await expect(call(() => auth.resetPassword('ama@example.com'))).resolves.toEqual({ success: false, error: 'Email rate limit exceeded' });
    supabase.auth.resetPasswordForEmail.mockRejectedValueOnce(new Error('offline'));
    await expect(call(() => auth.resetPassword('ama@example.com'))).resolves.toEqual({ success: false, error: 'offline' });
  });
});

describe('resendConfirmationEmail', () => {
  it('resends the sign-up email with the same link back to our own site', async () => {
    supabase.auth.resend.mockResolvedValue({ error: null });
    await mount();
    await expect(call(() => auth.resendConfirmationEmail('ama@example.com'))).resolves.toEqual({ success: true, message: 'Verification email sent! Please check your inbox.' });
    expect(supabase.auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'ama@example.com', options: { emailRedirectTo: 'https://app.trashdrops.com/auth/callback' } });
  });

  it('a refusal or a throw is reported', async () => {
    supabase.auth.resend.mockResolvedValueOnce({ error: { message: 'Email rate limit exceeded' } });
    await mount();
    await expect(call(() => auth.resendConfirmationEmail('a@b.c'))).resolves.toEqual({ success: false, error: 'Email rate limit exceeded' });
    supabase.auth.resend.mockRejectedValueOnce(new Error('offline'));
    await expect(call(() => auth.resendConfirmationEmail('a@b.c'))).resolves.toEqual({ success: false, error: 'offline' });
  });
});

describe('Google and Apple sign-in', () => {
  it('Google returns to our own dashboard and lets people pick an account', async () => {
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/x' }, error: null });
    await mount();
    await expect(call(() => auth.signInWithGoogle())).resolves.toMatchObject({ success: true });
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://app.trashdrops.com/dashboard', queryParams: { prompt: 'select_account' } },
    });
  });

  it("Google's own button sends the ID token and nonce to Supabase", async () => {
    supabase.auth.signInWithIdToken.mockResolvedValue({ data: { user: USER, session: SESSION }, error: null });
    await mount();
    await expect(call(() => auth.signInWithGoogleIdToken('google-token', 'nonce-1'))).resolves.toMatchObject({ success: true });
    expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'google-token', nonce: 'nonce-1' });
  });

  it('Apple returns to our own dashboard', async () => {
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    await mount();
    await expect(call(() => auth.signInWithApple())).resolves.toMatchObject({ success: true });
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'apple', options: { redirectTo: 'https://app.trashdrops.com/dashboard' } });
  });

  it.each([
    ['signInWithGoogle', 'signInWithOAuth', []],
    ['signInWithGoogleIdToken', 'signInWithIdToken', ['t', 'n']],
    ['signInWithApple', 'signInWithOAuth', []],
  ])('%s: a refusal or a throw is not a success', async (method, supabaseCall, args) => {
    supabase.auth[supabaseCall].mockResolvedValueOnce({ data: null, error: { message: 'Provider is not enabled' } });
    await mount();
    expect((await call(() => auth[method](...args))).success).toBe(false);
    supabase.auth[supabaseCall].mockRejectedValueOnce(new Error('offline'));
    expect((await call(() => auth[method](...args))).success).toBe(false);
  });
});
