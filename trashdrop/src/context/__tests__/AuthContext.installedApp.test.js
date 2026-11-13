import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuthProvider, useAuth } from '../AuthContext.js';
import supabase from '../../utils/supabaseClient.js';

// The app installed on the home screen (standalone) and Supabase's own
// session events. Installed, a sign-in kept on the phone is not trusted
// until Supabase confirms it, but the app never hangs on a white screen:
// after 2 seconds it falls back to the kept sign-in. In a browser tab the
// kept sign-in is used at once and checked in the background.
// AuthContext.staySignedIn.test.js covers the browser session check.
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
const mockPwaStores = [];
jest.mock('../../utils/pwaHelpers.js', () => ({
  storePwaAuthData: (user, session) => { mockPwaStores.push([user.id, session.access_token]); },
}));

const AMA = { id: 'u1', email: 'ama@example.com' };
const keptSignIn = () => {
  localStorage.setItem('trashdrop_user', JSON.stringify(AMA));
  localStorage.setItem('trashdrop_auth_token', 'kept-token');
};
const installed = (yes) => {
  window.matchMedia = jest.fn((q) => ({ matches: yes && q === '(display-mode: standalone)', addListener: jest.fn(), removeListener: jest.fn() }));
};
const networkError = { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' };

let authListener;
const Probe = () => {
  const { status, user, session } = useAuth();
  return (
    <>
      <p>status: {status}</p>
      <p>user: {user?.email || 'none'}</p>
      <p>token: {session?.access_token || 'none'}</p>
    </>
  );
};
const mount = () => render(<AuthProvider><Probe /></AuthProvider>);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mockPwaStores.length = 0;
  installed(false);
  supabase.auth.getSession.mockReset();
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

describe('installed on the home screen', () => {
  it('a kept sign-in waits for Supabase (nobody is shown as signed in yet), then takes its session', async () => {
    installed(true);
    keptSignIn();
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'fresh-token', user: AMA } }, error: null });
    mount();
    expect(screen.getByText('status: LOADING')).toBeInTheDocument();
    expect(screen.getByText('user: none')).toBeInTheDocument();

    await screen.findByText('token: fresh-token');
    expect(screen.getByText('status: AUTHENTICATED')).toBeInTheDocument();
    expect(localStorage.getItem('trashdrop_auth_token')).toBe('fresh-token');
    await waitFor(() => expect(mockPwaStores).toEqual([['u1', 'fresh-token']]));
  });

  it('a sign-in Supabase no longer has goes to the sign-in page, not to the kept user', async () => {
    installed(true);
    keptSignIn();
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mount();
    await screen.findByText('status: UNAUTHENTICATED');
    expect(screen.getByText('user: none')).toBeInTheDocument();
  });

  it('no connection: the kept sign-in is used', async () => {
    installed(true);
    keptSignIn();
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: networkError });
    mount();
    await screen.findByText('status: AUTHENTICATED');
    expect(screen.getByText('user: ama@example.com')).toBeInTheDocument();
  });

  it('a check that hangs: after 2 seconds the kept sign-in is used, never a white screen', async () => {
    jest.useFakeTimers();
    installed(true);
    keptSignIn();
    supabase.auth.getSession.mockReturnValue(new Promise(() => {}));
    mount();
    expect(screen.getByText('status: LOADING')).toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(2100); });
    expect(screen.getByText('status: AUTHENTICATED')).toBeInTheDocument();
    expect(screen.getByText('token: kept-token')).toBeInTheDocument();
  });

  it('nothing kept on the phone: the sign-in page at once, without asking Supabase', () => {
    installed(true);
    mount();
    expect(screen.getByText('status: UNAUTHENTICATED')).toBeInTheDocument();
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it('a kept token saved as the text "undefined" is not a sign-in', () => {
    installed(true);
    localStorage.setItem('trashdrop_user', JSON.stringify(AMA));
    localStorage.setItem('trashdrop_auth_token', 'undefined');
    mount();
    expect(screen.getByText('status: UNAUTHENTICATED')).toBeInTheDocument();
  });
});

describe('in a browser tab', () => {
  it('a kept sign-in is used at once; the background check does not ask Supabase again while it holds one', async () => {
    jest.useFakeTimers();
    keptSignIn();
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mount();
    expect(screen.getByText('status: AUTHENTICATED')).toBeInTheDocument();
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(2100); });
    // Supabase's own events (below) keep it current; a refused session arrives as SIGNED_OUT
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
    expect(screen.getByText('status: AUTHENTICATED')).toBeInTheDocument();
  });
});

describe("Supabase's session events", () => {
  it('a renewed token replaces the kept one', async () => {
    keptSignIn();
    mount();
    await act(async () => { await authListener('TOKEN_REFRESHED', { access_token: 'renewed-token', user: AMA }); });
    expect(screen.getByText('token: renewed-token')).toBeInTheDocument();
    expect(localStorage.getItem('trashdrop_auth_token')).toBe('renewed-token');
  });

  it('a sign-in elsewhere in the app (or on another tab) signs this one in', async () => {
    mount();
    await act(async () => { await authListener('SIGNED_IN', { access_token: 't2', user: AMA }); });
    expect(screen.getByText('status: AUTHENTICATED')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('trashdrop_user')).id).toBe('u1');
  });

  it('signed out by Supabase (another tab, or a refused session): the phone forgets the user', async () => {
    keptSignIn();
    mount();
    await act(async () => { await authListener('SIGNED_OUT', null); });
    await screen.findByText('status: UNAUTHENTICATED');
    expect(localStorage.getItem('trashdrop_user')).toBeNull();
    expect(localStorage.getItem('trashdrop_auth_token')).toBeNull();
  });
});
