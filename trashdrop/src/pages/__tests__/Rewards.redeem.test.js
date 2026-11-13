import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Rewards from '../Rewards.js';
import { userService } from '../../services/userService.js';

// Redeeming goes through the server (td_redeem_reward): it checks the cost
// and the balance, so the app never writes a redemption itself.
jest.mock('../../context/AuthContext.js', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../../utils/realtime.js', () => ({
  subscribeToRewardsUpdates: () => ({ unsubscribe: () => {} }),
  handleRewardsUpdate: () => {},
}));
jest.mock('../../services/userService.js', () => ({ userService: { getUserStats: jest.fn() } }));

// Plain functions and variables: CRA's resetMocks would wipe jest.fn implementations
let mockRpcCalls = [];
let mockWrites = [];
let mockRpcAnswer = () => ({ data: { id: 'x1', points_spent: 100, balance_after: 205 }, error: null });
jest.mock('../../utils/supabaseClient.js', () => {
  const builder = (name) => {
    const b = new Proxy({}, {
      get: (_, prop) => {
        if (prop === 'then') {
          return (resolve) => resolve(name === 'rewards'
            ? { data: [{ id: 'r9', name: 'Shopping voucher', description: 'Partner store', points_cost: 100, active: true, category: 'voucher' }], error: null }
            : { data: [], error: null });
        }
        if (['insert', 'update', 'upsert', 'delete'].includes(prop)) return (...args) => { mockWrites.push([name, prop, ...args]); return b; };
        return () => b;
      },
    });
    return b;
  };
  return {
    __esModule: true,
    default: {
      from: (name) => builder(name),
      rpc: (fn, args) => { mockRpcCalls.push([fn, args]); return Promise.resolve(mockRpcAnswer(fn, args)); },
    },
  };
});

beforeEach(() => {
  mockRpcCalls = [];
  mockWrites = [];
  mockRpcAnswer = () => ({ data: { id: 'x1', points_spent: 100, balance_after: 205 }, error: null });
  userService.getUserStats.mockResolvedValue({ data: { points: 305 }, error: null });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const redeem = async () => {
  render(<MemoryRouter><Rewards /></MemoryRouter>);
  expect(await screen.findByText('305')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Redeem Reward/i }));
};

describe('Redeeming a reward', () => {
  it('asks the server to redeem it and shows the balance the server worked out', async () => {
    await redeem();

    expect(mockRpcCalls).toEqual([['td_redeem_reward', { p_reward_id: 'r9', p_phone: null, p_network: null }]]);
    expect(mockWrites.filter(([table]) => table === 'rewards_redemption')).toEqual([]);
    // Nor the activity row: td_redeem_reward writes it with the server's figures (TD68)
    expect(mockWrites).toEqual([]);
    expect(await screen.findByText('205')).toBeInTheDocument();
    expect(await screen.findByText(/Successfully redeemed Shopping voucher/)).toBeInTheDocument();
  });

  it("shows the server's reason when it refuses", async () => {
    mockRpcAnswer = () => ({ data: null, error: { message: 'Not enough points for this reward' } });
    await redeem();

    expect(await screen.findByText('Not enough points for this reward')).toBeInTheDocument();
    expect(screen.getByText('305')).toBeInTheDocument();
  });
});
