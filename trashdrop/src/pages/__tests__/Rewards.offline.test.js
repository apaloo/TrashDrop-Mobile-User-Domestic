import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Rewards from '../Rewards.js';
import { userService } from '../../services/userService.js';
import { saveLastKnown } from '../../utils/lastKnown.js';

jest.mock('../../context/AuthContext.js', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../../utils/realtime.js', () => ({
  subscribeToRewardsUpdates: () => ({ unsubscribe: () => {} }),
  handleRewardsUpdate: () => {},
}));
jest.mock('../../services/userService.js', () => ({ userService: { getUserStats: jest.fn() } }));

let mockTables;
jest.mock('../../utils/supabaseClient.js', () => {
  const builder = (name) => {
    const b = new Proxy({}, {
      get: (_, prop) => (prop === 'then' ? (resolve) => resolve(mockTables(name)) : () => b),
    });
    return b;
  };
  return { __esModule: true, default: { from: (name) => builder(name) } };
});

const dropped = { message: 'TypeError: Failed to fetch' };
const setOffline = () => mockTables = () => ({ data: null, error: dropped });

const mount = () => render(<MemoryRouter><Rewards /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  setOffline();
  userService.getUserStats.mockResolvedValue({ data: null, error: dropped });
});

afterEach(() => jest.restoreAllMocks());

describe('Rewards with no connection', () => {
  it('shows no error and does not claim there is nothing', async () => {
    mount();

    expect(await screen.findByText("Rewards will appear when you're back online.")).toBeInTheDocument();
    expect(await screen.findByText("Your redemptions will appear when you're back online.")).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/No rewards available/)).not.toBeInTheDocument();
    expect(screen.queryByText(/haven't redeemed/)).not.toBeInTheDocument();
    // A balance it couldn't fetch stays "loading", never 0
    expect(screen.getByLabelText('Loading your points')).toBeInTheDocument();
  });

  it('shows the last saved balance and rewards', async () => {
    saveLastKnown('points', 'u1', 305);
    saveLastKnown('rewards', 'u1', [{ id: 'r1', name: 'GH₵5 airtime', description: 'MTN', pointsCost: 100, category: 'airtime' }]);
    mount();

    expect(await screen.findByText('GH₵5 airtime')).toBeInTheDocument();
    expect(await screen.findByText('305')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reloads by itself when the connection is back', async () => {
    mount();
    await screen.findByText("Rewards will appear when you're back online.");

    mockTables = (name) => (name === 'rewards'
      ? { data: [{ id: 'r1', name: 'GH₵5 airtime', description: 'MTN', points_cost: 100, category: 'airtime' }], error: null }
      : { data: [], error: null });
    userService.getUserStats.mockResolvedValue({ data: { points: 42 }, error: null });

    await act(async () => { window.dispatchEvent(new Event('online')); });

    expect(await screen.findByText('GH₵5 airtime')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    expect(await screen.findByText(/haven't redeemed/)).toBeInTheDocument();
  });

});

describe('Rewards when the server fails', () => {
  const serverError = { message: 'permission denied', code: '42501' };
  beforeEach(() => {
    mockTables = () => ({ data: null, error: serverError });
    userService.getUserStats.mockResolvedValue({ data: null, error: serverError });
  });

  it('says so plainly, with no false zero or empty lists', async () => {
    mount();

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load everything on this page. We'll keep trying.");
    expect(screen.getByText("Rewards couldn't load.")).toBeInTheDocument();
    expect(screen.getByText("Your redemptions couldn't load.")).toBeInTheDocument();
    expect(screen.getByLabelText('Balance unavailable')).toBeInTheDocument();
    expect(screen.getByText("Couldn't check your balance")).toBeInTheDocument();
    expect(screen.queryByText(/No rewards available/)).not.toBeInTheDocument();
    expect(screen.queryByText(/haven't redeemed/)).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('has no retry button and recovers by itself', async () => {
    jest.useFakeTimers();
    try {
      mount();
      await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
      expect(screen.getByRole('alert')).toHaveTextContent("We'll keep trying");
      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();

      mockTables = (name) => (name === 'rewards'
        ? { data: [{ id: 'r1', name: 'GH₵5 airtime', description: 'MTN', points_cost: 100, category: 'airtime' }], error: null }
        : { data: [], error: null });
      userService.getUserStats.mockResolvedValue({ data: { points: 42 }, error: null });

      await act(async () => { jest.advanceTimersByTime(30000); });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

      expect(screen.getByText('GH₵5 airtime')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('only the part that failed says so', async () => {
    mockTables = (name) => (name === 'rewards' ? { data: null, error: serverError } : { data: [], error: null });
    userService.getUserStats.mockResolvedValue({ data: { points: 42 }, error: null });
    mount();

    expect(await screen.findByText("Rewards couldn't load.")).toBeInTheDocument();
    expect(await screen.findByText(/haven't redeemed/)).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});
