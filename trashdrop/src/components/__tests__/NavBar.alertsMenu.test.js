import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import NavBar from '../NavBar.js';
import { useAuth } from '../../context/AuthContext.js';
import { notificationService } from '../../services/notificationService.js';

jest.mock('../../context/AuthContext.js', () => ({ useAuth: jest.fn() }));
jest.mock('../../context/ThemeContext.js', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: jest.fn() }) }));
jest.mock('../../services/notificationService.js', () => ({ notificationService: { getUserNotifications: jest.fn() } }));
jest.mock('../../utils/toastNotifications.js', () => ({ showToast: jest.fn() }));
jest.mock('../../utils/supabaseClient.js', () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { __esModule: true, default: { channel: () => channel, removeChannel: jest.fn() } };
});

const mount = () => render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <NavBar />
    <Routes>
      <Route path="/dashboard" element={<p>dashboard page</p>} />
      <Route path="/notifications" element={<p>notifications page</p>} />
    </Routes>
  </MemoryRouter>
);

const unread = (n) => notificationService.getUserNotifications.mockResolvedValue({ data: Array.from({ length: n }, (_, i) => ({ id: i })) });

beforeEach(() => {
  useAuth.mockReturnValue({ isAuthenticated: true, signOut: jest.fn(), user: { id: 'u1', email: 'ama@example.com' } });
});

describe('Profile menu on phones', () => {
  it('has Alerts instead of Sign Out, and Alerts opens the notifications page', async () => {
    unread(0);
    mount();

    fireEvent.click(screen.getByRole('button', { name: 'Profile menu' }));
    const menu = screen.getByText('Your Profile').parentElement;

    expect(menu).not.toHaveTextContent('Sign Out');
    fireEvent.click(screen.getByRole('link', { name: /Alerts/ }));

    expect(screen.getByText('notifications page')).toBeInTheDocument();
    expect(screen.queryByText('Your Profile')).not.toBeInTheDocument();
  });

  it('shows the unread count on Alerts and a dot on the profile circle', async () => {
    unread(3);
    mount();

    const profile = await screen.findByRole('button', { name: 'Profile menu, 3 unread alerts' });
    expect(screen.getByTestId('unread-dot')).toBeInTheDocument();

    fireEvent.click(profile);
    expect(screen.getByRole('link', { name: /Alerts.*3.*unread/ })).toBeInTheDocument();
  });

  it('shows no dot when everything is read', async () => {
    unread(0);
    mount();
    await waitFor(() => expect(notificationService.getUserNotifications).toHaveBeenCalled());
    expect(screen.queryByTestId('unread-dot')).not.toBeInTheDocument();
  });
});
