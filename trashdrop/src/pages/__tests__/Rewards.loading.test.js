import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Rewards from '../Rewards.js';
import { userService } from '../../services/userService.js';

jest.mock('../../context/AuthContext.js', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../../utils/realtime.js', () => ({
  subscribeToRewardsUpdates: () => ({ unsubscribe: () => {} }),
  handleRewardsUpdate: () => {},
}));
jest.mock('../../services/userService.js', () => ({ userService: { getUserStats: jest.fn() } }));

const REWARDS = [{ id: 'r1', name: 'GH₵5 airtime', description: 'MTN, Telecel or AT', points_cost: 100, active: true, category: 'airtime' }];

// Query builder: rewards answer at once, redemptions are empty
jest.mock('../../utils/supabaseClient.js', () => {
  const builder = (result) => {
    const b = new Proxy({}, {
      get: (_, prop) => (prop === 'then' ? (resolve) => resolve(result) : () => b),
    });
    return b;
  };
  return {
    __esModule: true,
    default: {
      from: (name) => builder(name === 'rewards'
        ? { data: [{ id: 'r1', name: 'GH₵5 airtime', description: 'MTN, Telecel or AT', points_cost: 100, active: true, category: 'airtime' }], error: null }
        : { data: [], error: null }),
    },
  };
});

describe('Rewards page loading', () => {
  it('shows the rewards before the points arrive, and waits for points before allowing a redeem', async () => {
    let finishPoints;
    userService.getUserStats.mockReturnValue(new Promise((resolve) => { finishPoints = resolve; }));

    render(<MemoryRouter><Rewards /></MemoryRouter>);

    // The page is up with the list while the balance is still loading
    expect(await screen.findByText(REWARDS[0].name)).toBeInTheDocument();
    expect(screen.getByLabelText('Loading your points')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Checking points/i })).toBeDisabled();

    await act(async () => finishPoints({ data: { points: 305 }, error: null }));

    expect(screen.getByText('305')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Redeem Reward/i })).toBeEnabled();
  });
});
