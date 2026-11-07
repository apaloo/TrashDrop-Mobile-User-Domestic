import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Security from '../Security.js';
import { useAuth } from '../../../context/AuthContext.js';
import supabase from '../../../utils/supabaseClient.js';
import { describeSignIn } from '../../../utils/signInMethod.js';

jest.mock('../../../context/AuthContext.js', () => ({ useAuth: jest.fn() }));
jest.mock('../../../utils/supabaseClient.js', () => ({
  __esModule: true,
  default: { auth: { signOut: jest.fn(), updateUser: jest.fn(), signInWithPassword: jest.fn() } },
}));

let signOut;
const mount = (user) => {
  signOut = jest.fn().mockResolvedValue({ success: true });
  useAuth.mockReturnValue({ user, signOut });
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<Security />} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>
  );
};

const googleUser = { id: 'u1', email: 'ama@example.com', app_metadata: { provider: 'google' } };

beforeEach(() => {
  supabase.auth.signOut.mockReset().mockResolvedValue({ error: null });
  localStorage.clear();
});

describe('Profile & Settings: signing out', () => {
  it('has Sign out in place of "Logout from All Devices"', () => {
    mount(googleUser);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByText(/Logout from All Devices/i)).not.toBeInTheDocument();
  });

  it('asks first, reminds how they sign in, then signs out this phone only', async () => {
    localStorage.setItem('trashdrop_remembered_email', 'ama@example.com');
    mount(googleUser);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('sign-in-reminder')).toHaveTextContent('Next time, sign in with Google (ama@example.com).');
    expect(signOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));

    await waitFor(() => expect(screen.getByText('sign-in page')).toBeInTheDocument());
    expect(signOut).toHaveBeenCalledWith();
    // The remembered email is kept so signing back in is easier
    expect(localStorage.getItem('trashdrop_remembered_email')).toBe('ama@example.com');
  });

  it('can sign out the other devices and stay signed in here', async () => {
    mount(googleUser);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out of other devices' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out others' }));

    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'others' }));
    expect(await screen.findByText(/You are still signed in here/)).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('describeSignIn', () => {
  it.each([
    [googleUser, 'Google (ama@example.com)'],
    [{ email: 'kofi@example.com', app_metadata: { provider: 'email' } }, 'your email and password (kofi@example.com)'],
    [{ phone: '233241234567', app_metadata: { provider: 'phone' } }, 'your phone number (233241234567)'],
    [{ email: 'esi@example.com' }, 'esi@example.com'],
    [null, null],
  ])('%#', (user, expected) => {
    expect(describeSignIn(user)).toBe(expected);
  });
});
