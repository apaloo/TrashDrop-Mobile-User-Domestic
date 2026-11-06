import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import Login from '../Login.js';
import { useAuth } from '../../context/AuthContext.js';
import { suggestEmailFix } from '../../utils/emailTypo.js';

jest.mock('../../context/AuthContext.js');
jest.mock('../../components/SocialLogin.js', () => () => null);

const ResetProbe = () => {
  const location = useLocation();
  return <p>reset page for {location.state?.email}</p>;
};

const renderLogin = () => render(
  <MemoryRouter initialEntries={['/login']}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetProbe />} />
    </Routes>
  </MemoryRouter>
);

const signInWith = (email, password = 'Wrong123!') => {
  fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};

describe('Login when the email and password do not match', () => {
  const signIn = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ signIn, isLoading: false, resendConfirmationEmail: jest.fn() });
    signIn.mockResolvedValue({
      success: false,
      error: { message: 'Invalid login credentials', originalMessage: 'Invalid login credentials' }
    });
  });

  it('names the email tried and says what to do next', async () => {
    renderLogin();
    signInWith('ama@gmail.com');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("That email and password don't match");
    expect(alert).toHaveTextContent('ama@gmail.com');
    expect(alert).toHaveTextContent(/Caps Lock is off/);
    expect(alert).toHaveTextContent(/Signed up with Google\? Use Continue with Google/);
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
    expect(screen.queryByText(/Incorrect email or password/)).not.toBeInTheDocument();
    // The password is cleared for a fresh try; the email stays
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Email Address')).toHaveValue('ama@gmail.com');
  });

  it('opens password reset with the email already filled in', async () => {
    renderLogin();
    signInWith('ama@gmail.com');

    fireEvent.click(await screen.findByRole('link', { name: 'Reset password' }));
    expect(screen.getByText('reset page for ama@gmail.com')).toBeInTheDocument();
  });

  it('pushes the reset after a second failed try', async () => {
    renderLogin();
    signInWith('ama@gmail.com');
    await screen.findByRole('link', { name: 'Reset password' });
    signInWith('ama@gmail.com', 'Another1!');
    expect(await screen.findByRole('link', { name: /Reset it now/ })).toBeInTheDocument();
  });

  it('offers a fix for a mistyped email domain', async () => {
    renderLogin();
    signInWith('ama@gmial.com');

    fireEvent.click(await screen.findByRole('button', { name: 'ama@gmail.com' }));
    expect(screen.getByLabelText('Email Address')).toHaveValue('ama@gmail.com');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sends the email without stray spaces', async () => {
    renderLogin();
    signInWith('  ama@gmail.com ');
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('ama@gmail.com', 'Wrong123!', expect.any(Boolean)));
  });

  it('warns when Caps Lock is on', () => {
    renderLogin();
    const password = screen.getByLabelText('Password');
    fireEvent.keyUp(password, { key: 'A', modifierCapsLock: true });
    expect(screen.getByText('Caps Lock is on')).toBeInTheDocument();
    fireEvent.keyUp(password, { key: 'a', modifierCapsLock: false });
    expect(screen.queryByText('Caps Lock is on')).not.toBeInTheDocument();
  });
});

describe('suggestEmailFix', () => {
  it.each([
    ['ama@gmial.com', 'ama@gmail.com'],
    ['ama@gmai.com', 'ama@gmail.com'],
    ['ama@yaho.com', 'ama@yahoo.com'],
    ['ama@hotmial.com', 'ama@hotmail.com'],
    ['ama@gmail.com', null],
    ['ama@trashdrop.org', null],
    ['not-an-email', null]
  ])('%s -> %s', (input, expected) => {
    expect(suggestEmailFix(input)).toBe(expected);
  });
});
