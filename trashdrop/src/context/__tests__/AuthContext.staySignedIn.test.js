import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
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
    },
  },
}));
jest.mock('../../utils/errorLogger.js', () => ({
  logAuthError: jest.fn(),
  ERROR_CATEGORIES: { AUTH: 'auth', NETWORK: 'network' },
}));
jest.mock('../../utils/performanceMonitor.js', () => ({ __esModule: true, default: {} }));

// Supabase keeps its own copy of the session under this kind of key
const SUPABASE_KEY = 'sb-test-auth-token';

// A JWT whose expiry is `secondsFromNow` away (negative: already expired)
const jwt = (secondsFromNow) => {
  const enc = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + secondsFromNow })}.sig`;
};

const signedInBefore = (accessToken = jwt(3600)) => {
  localStorage.setItem('trashdrop_user', JSON.stringify({ id: 'u1', email: 'ama@example.com' }));
  localStorage.setItem('trashdrop_auth_token', accessToken);
  localStorage.setItem(SUPABASE_KEY, JSON.stringify({ refresh_token: 'r1' }));
};

const networkError = { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' };

let authListener;
const Probe = () => {
  const { status, user, session, checkSession, signOut } = useAuth();
  return (
    <>
      <p>status: {status}</p>
      <p>user: {user?.email || 'none'}</p>
      <p>token: {session?.access_token || 'none'}</p>
      <button type="button" onClick={() => checkSession(true)}>check</button>
      <button type="button" onClick={() => signOut()}>sign out</button>
      <button type="button" onClick={() => signOut({ scope: 'global' })}>sign out everywhere</button>
    </>
  );
};
const mount = () => render(<AuthProvider><Probe /></AuthProvider>);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.matchMedia = jest.fn(() => ({ matches: false, addListener: jest.fn(), removeListener: jest.fn() }));
  supabase.auth.getSession.mockReset();
  supabase.auth.refreshSession.mockReset();
  supabase.auth.signOut.mockReset().mockResolvedValue({ error: null });
  supabase.auth.onAuthStateChange.mockReset().mockImplementation((cb) => {
    authListener = cb;
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Staying signed in', () => {
  it('stays signed in when the session check cannot reach Supabase', async () => {
    signedInBefore();
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: networkError });
    mount();

    fireEvent.click(screen.getByText('check'));

    await waitFor(() => expect(supabase.auth.getSession).toHaveBeenCalled());
    await screen.findByText('status: AUTHENTICATED');
    expect(screen.getByText('user: ama@example.com')).toBeInTheDocument();
    expect(localStorage.getItem(SUPABASE_KEY)).not.toBeNull();
    expect(localStorage.getItem('trashdrop_user')).not.toBeNull();
  });

  it('stays signed in when the session check hangs on a weak signal', async () => {
    jest.useFakeTimers();
    signedInBefore();
    supabase.auth.getSession.mockReturnValue(new Promise(() => {}));
    mount();

    fireEvent.click(screen.getByText('check'));
    await act(async () => { jest.advanceTimersByTime(9000); });

    expect(screen.getByText('status: AUTHENTICATED')).toBeInTheDocument();
    expect(localStorage.getItem(SUPABASE_KEY)).not.toBeNull();
  });

  it('keeps the sign-in when the saved access token has expired (they last an hour)', async () => {
    signedInBefore(jwt(-2 * 3600));
    const renewed = { access_token: 'renewed-token', user: { id: 'u1', email: 'ama@example.com' } };
    supabase.auth.getSession.mockResolvedValue({ data: { session: renewed }, error: null });
    mount();

    fireEvent.click(screen.getByText('check'));

    await screen.findByText('token: renewed-token');
    expect(screen.getByText('status: AUTHENTICATED')).toBeInTheDocument();
    expect(localStorage.getItem(SUPABASE_KEY)).not.toBeNull();
  });

  it('signs out when Supabase no longer has the session', async () => {
    signedInBefore();
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mount();

    fireEvent.click(screen.getByText('check'));

    await screen.findByText('status: UNAUTHENTICATED');
  });

  it('does not renew the session on its own timers (Supabase does that)', async () => {
    jest.useFakeTimers();
    signedInBefore();
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mount();

    await act(async () => { jest.advanceTimersByTime(2 * 60 * 60 * 1000); });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });

    expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
    expect(screen.getByText('status: AUTHENTICATED')).toBeInTheDocument();
  });

  it('takes the renewed session Supabase reports on start-up', async () => {
    signedInBefore('old-token');
    mount();
    expect(screen.getByText('token: old-token')).toBeInTheDocument();

    await act(async () => {
      await authListener('INITIAL_SESSION', { access_token: 'fresh-token', user: { id: 'u1', email: 'ama@example.com' } });
    });

    expect(screen.getByText('token: fresh-token')).toBeInTheDocument();
    expect(localStorage.getItem('trashdrop_auth_token')).toBe('fresh-token');
  });
});

describe('Signing out', () => {
  it('signs out this phone only', async () => {
    signedInBefore();
    mount();

    fireEvent.click(screen.getByText('sign out'));

    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' }));
    await screen.findByText('status: UNAUTHENTICATED');
  });

  it('signs out every device only when asked to', async () => {
    signedInBefore();
    mount();

    fireEvent.click(screen.getByText('sign out everywhere'));

    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' }));
  });
});
