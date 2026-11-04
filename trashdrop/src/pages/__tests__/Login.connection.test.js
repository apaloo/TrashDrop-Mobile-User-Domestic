import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Login from '../Login.js';
import { useAuth } from '../../context/AuthContext.js';

jest.mock('../../context/AuthContext.js');
jest.mock('../../components/SocialLogin.js', () => () => null);

const connectionFailure = (connection) => ({
  success: false,
  error: { code: 'NETWORK_ERROR', connection, message: 'x' },
});

const signInWith = () => {
  render(<MemoryRouter><Login /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'ama@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Secret123!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};

describe('Login when the connection fails', () => {
  const signIn = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ signIn, isLoading: false, resendConfirmationEmail: jest.fn() });
  });

  it('says what happened and offers to try again', async () => {
    signIn.mockResolvedValueOnce(connectionFailure('unreachable'));
    signInWith();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach TrashDrop");
    expect(screen.queryByText(/check your credentials/i)).not.toBeInTheDocument();

    signIn.mockResolvedValueOnce({ success: true });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('signs in by itself when the phone comes back online', async () => {
    signIn.mockResolvedValueOnce(connectionFailure('offline'));
    signInWith();

    expect(await screen.findByRole('alert')).toHaveTextContent("You're offline");
    expect(screen.getByText('Waiting for a connection…')).toBeInTheDocument();

    signIn.mockResolvedValueOnce({ success: true });
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it('blames the server, not the phone, when the server fails', async () => {
    signIn.mockResolvedValueOnce(connectionFailure('server'));
    signInWith();
    expect(await screen.findByRole('alert')).toHaveTextContent("It isn't your connection");
  });
});
