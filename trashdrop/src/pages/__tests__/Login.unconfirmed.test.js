import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Login from '../Login.js';
import { useAuth } from '../../context/AuthContext.js';

jest.mock('../../context/AuthContext.js');
jest.mock('../../components/SocialLogin.js', () => () => null);

const renderLogin = (state) => render(
  <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
    <Login />
  </MemoryRouter>
);

describe('Login with an unconfirmed email', () => {
  const signIn = jest.fn();
  const resendConfirmationEmail = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ signIn, isLoading: false, resendConfirmationEmail });
  });

  it('says why sign-in failed and offers a new link', async () => {
    signIn.mockResolvedValue({
      success: false,
      error: { message: 'Please verify your email address', code: 'email_not_confirmed', originalMessage: 'Email not confirmed' }
    });
    renderLogin();

    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'ama@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Secret123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Your email address isn't confirmed yet. Open the link we sent to ama@example.com"
    );
    resendConfirmationEmail.mockResolvedValue({ success: true, message: 'Verification email sent! Please check your inbox.' });
    fireEvent.click(screen.getByRole('button', { name: 'Resend Verification Email' }));
    await waitFor(() => expect(resendConfirmationEmail).toHaveBeenCalledWith('ama@example.com'));
  });

  it('coming from sign-up, fills in the email and reminds the user to confirm it', () => {
    renderLogin({ email: 'ama@example.com', awaitingConfirmation: true });

    expect(screen.getByLabelText('Email Address')).toHaveValue('ama@example.com');
    expect(screen.getByRole('status')).toHaveTextContent('Confirm your email first');
    expect(screen.getByRole('button', { name: 'Resend Verification Email' })).toBeInTheDocument();
  });
});
