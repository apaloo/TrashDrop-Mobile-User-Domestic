import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Activity from '../Activity.js';
import supabase from '../../utils/supabaseClient.js';
import { saveLastKnown } from '../../utils/lastKnown.js';

jest.mock('../../context/AuthContext.js', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../../utils/supabaseClient.js', () => ({
  __esModule: true,
  default: { from: jest.fn(), rpc: jest.fn(), auth: { getSession: jest.fn() } },
}));

const setOnline = (value) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
const mount = () => render(<MemoryRouter><Activity /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  window.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  setOnline(false);
});

afterEach(() => {
  setOnline(true);
  jest.restoreAllMocks();
});

describe('Activity with no connection', () => {
  it('shows a calm note: no error, no Try Again, and not "No activity yet"', async () => {
    mount();
    expect(await screen.findByText("Your activity will appear when you're back online.")).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
    expect(screen.queryByText('No activity yet')).not.toBeInTheDocument();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('shows the saved list', async () => {
    saveLastKnown('activity', 'u1', [{
      id: 'a1', type: 'dumping_report', status: 'submitted', description: 'Dumping near the market', address: 'Madina',
      date: '11/8/2026', points: 0, created_at: '2026-11-08T10:00:00Z',
    }]);
    mount();
    expect(await screen.findByText(/Madina/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('weak signal (phone says online, every lookup drops): calm note, not "No activity yet"', async () => {
    jest.useFakeTimers();
    try {
      setOnline(true);
      const b = new Proxy({}, { get: (_, p) => (p === 'then' ? (r) => r({ data: null, error: { message: 'TypeError: Failed to fetch' } }) : () => b) });
      supabase.from.mockReturnValue(b);
      supabase.auth.getSession.mockResolvedValue({ data: { session: {} }, error: null });
      mount();
      for (let i = 0; i < 6; i += 1) {
        await act(async () => { jest.advanceTimersByTime(4000); });
      }
      expect(screen.getByText("Your activity will appear when you're back online.")).toBeInTheDocument();
      expect(screen.queryByText('No activity yet')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('tries the server again when the connection is back', async () => {
    mount();
    await screen.findByText("Your activity will appear when you're back online.");
    expect(supabase.from).not.toHaveBeenCalled();

    const b = new Proxy({}, { get: (_, p) => (p === 'then' ? (r) => r({ data: [], error: null }) : () => b) });
    supabase.from.mockReturnValue(b);
    supabase.rpc.mockResolvedValue({ data: [], error: null });
    setOnline(true);
    await act(async () => { window.dispatchEvent(new Event('online')); });

    await waitFor(() => expect(supabase.from).toHaveBeenCalled());
  });
});
