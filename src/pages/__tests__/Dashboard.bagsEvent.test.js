import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import Dashboard from '../Dashboard.js';

// Mock AuthContext to provide a user
jest.mock('../../context/AuthContext.js', () => ({
  useAuth: () => ({ user: { id: 'user123', email: 'test@example.com' } })
}));

// Mock services used by Dashboard to avoid network
jest.mock('../../services/index.js', () => ({
  userService: {
    getUserStats: jest.fn().mockResolvedValue({ data: { points: 0, pickups: 0, reports: 0, batches: 0, totalBags: 0 }, error: null })
  },
  activityService: {
    getUserActivity: jest.fn().mockResolvedValue({ data: [], error: null })
  },
  pickupService: {}
}));

// Mock supabase client minimal
jest.mock('../../utils/supabaseClient.js', () => ({
  auth: { refreshSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }) }
}));

// Mock realtime subscriptions to no-op
jest.mock('../../utils/realtime.js', () => ({
  subscribeToStatsUpdates: () => ({ unsubscribe: jest.fn() }),
  handleStatsUpdate: (tableType, payload, prev) => prev,
  subscribeToDumpingReports: () => ({ unsubscribe: jest.fn() }),
  handleDumpingReportUpdate: (payload, cb) => cb && cb()
}));

// Mock offline storage
jest.mock('../../utils/offlineStorage.js', () => ({
  cacheUserStats: jest.fn(),
  getCachedUserStats: jest.fn().mockResolvedValue(null),
  cacheUserActivity: jest.fn(),
  getCachedUserActivity: jest.fn().mockResolvedValue([]),
  isOnline: () => false
}));

describe('Dashboard optimistic bag updates via global event', () => {
  it('increments Bags count when trashdrop:bags-updated is dispatched', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Initially should show 0 bags (or not show the target number yet)
    expect(screen.queryByText(/^7$/)).not.toBeInTheDocument();

    // Dispatch a global event to add 7 bags
    await act(async () => {
      const evt = new CustomEvent('trashdrop:bags-updated', {
        detail: { userId: 'user123', deltaBags: 7, source: 'test' }
      });
      window.dispatchEvent(evt);
    });

    // Wait for any element to reflect number 7 (bags value updates)
    await waitFor(() => {
      expect(screen.getAllByText('7').length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });
});
