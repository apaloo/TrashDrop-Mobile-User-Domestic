import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

import Dashboard from '../Dashboard.js';
import BatchQRScanner from '../../components/BatchQRScanner.js';

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

// Batch verification: this batch adds 4 bags
jest.mock('../../services/batchService.js', () => ({
  batchService: {
    verifyBatchAndUpdateUser: () => Promise.resolve({
      data: { batch_id: 'BATCH-123', status: 'used', activated: true, bags_added: 4, bag_count: 4 },
      error: null,
    }),
  },
}));
jest.mock('../../services/notificationService.js', () => ({
  notificationService: { createNotification: () => Promise.resolve({ data: null, error: null }) },
}));

// The scanner's camera view (QRReader wraps qr-scanner, which needs a real camera)
jest.mock('../../components/QRReader', () =>
  function MockQrReader({ onScan }) {
    return (
      <div data-testid="mock-qr-reader">
        <button onClick={() => onScan({ text: 'BATCH-123' })}>Simulate Scan</button>
      </div>
    );
  }
);

const qrBagsCount = () => screen.getByText(/^QR Bags?$/).previousElementSibling;

describe('Integration: a batch scan updates the Dashboard', () => {
  it('the Dashboard shows the scanned bags', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });

    render(
      <MemoryRouter>
        <div>
          <Dashboard />
          <BatchQRScanner />
        </div>
      </MemoryRouter>
    );
    await screen.findByText('Your impact');
    // The first load starts 100 ms after mount; the empty activity list shows it finished
    await screen.findByText('No recent activities yet');
    expect(qrBagsCount()).toHaveTextContent('0');

    await act(async () => { fireEvent.click(screen.getByText('Start Scanning')); });
    await act(async () => { fireEvent.click(screen.getByText('Simulate Scan')); });

    // BatchQRScanner dispatches trashdrop:bags-updated; the Dashboard adds the bags
    expect(await screen.findByText('Batch Scanned Successfully!')).toBeInTheDocument();
    await waitFor(() => expect(qrBagsCount()).toHaveTextContent('4'));
  });
});
