import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import Dashboard from '../Dashboard.js';

// Mock AuthContext to provide a user
// One user object, as the real context keeps it: a new object each render
// re-runs every [user] effect and the page never settles
jest.mock('../../context/AuthContext.js', () => {
  const auth = { user: { id: 'user123', email: 'test@example.com' } };
  return { useAuth: () => auth };
});

// Mock services used by Dashboard to avoid network (plain functions: react-scripts
// resets jest.fn() implementations before each test)
jest.mock('../../services/index.js', () => ({
  userService: {
    getUserStats: () => Promise.resolve({ data: { points: 0, pickups: 0, reports: 0, batches: 0, totalBags: 0 }, error: null })
  },
  activityService: {
    getUserActivity: () => Promise.resolve({ data: [], error: null })
  },
  pickupService: {}
}));

// Mock supabase client minimal
jest.mock('../../utils/supabaseClient.js', () => require('../../test-utils/mockSupabaseClient.js'));

// The dashboard loads through the seamless service: a user with no bags yet
jest.mock('../../services/seamlessDashboardService.js', () => ({
  __esModule: true,
  default: {
    getUserStats: () => Promise.resolve({ points: 0, pickups: 0, reports: 0, batches: 0, totalBags: 0, available_bags: 0 }),
    getRecentActivities: () => Promise.resolve([]),
    getActivePickups: () => Promise.resolve([]),
    subscribeToUpdates: () => ({}),
    preloadDashboardData: () => Promise.resolve(),
    forceRefresh: () => Promise.resolve(),
    optimisticUpdateStats: () => {},
    optimisticAddActivity: () => {},
  },
}));

// Mock realtime subscriptions to no-op
jest.mock('../../utils/realtime.js', () => ({
  subscribeToStatsUpdates: () => ({ unsubscribe: () => {} }),
  handleStatsUpdate: (tableType, payload, prev) => prev,
  subscribeToDumpingReports: () => ({ unsubscribe: () => {} }),
  handleDumpingReportUpdate: (payload, cb) => cb && cb()
}));

// Mock offline storage
jest.mock('../../utils/offlineStorage.js', () => ({
  cacheUserStats: () => {},
  getCachedUserStats: () => Promise.resolve(null),
  cacheUserActivity: () => {},
  getCachedUserActivity: () => Promise.resolve([]),
  isOnline: () => false
}));

// The QR Bags number in the "Your impact" tiles
const qrBagsCount = () => screen.getByText(/^QR Bags?$/).previousElementSibling;

const bagsUpdated = (detail) =>
  act(async () => {
    window.dispatchEvent(new CustomEvent('trashdrop:bags-updated', { detail }));
  });

describe('Dashboard optimistic bag updates via global event', () => {
  const renderDashboard = async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );
    // Wait for the first load, as a scan only happens on a loaded page
    await screen.findByText('Your impact');
    // The first load starts 100 ms after mount; the empty activity list shows it finished
    await screen.findByText('No recent activities yet');
    expect(qrBagsCount()).toHaveTextContent('0');
  };

  it('adds the scanned bags to the QR Bags count', async () => {
    await renderDashboard();
    await bagsUpdated({ userId: 'user123', deltaBags: 7, source: 'test' });
    await waitFor(() => expect(qrBagsCount()).toHaveTextContent('7'));
  });

  it("ignores another user's event", async () => {
    await renderDashboard();
    await bagsUpdated({ userId: 'someone-else', deltaBags: 7, source: 'test' });
    expect(qrBagsCount()).toHaveTextContent('0');
  });
});
