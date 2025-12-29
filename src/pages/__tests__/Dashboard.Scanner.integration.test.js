import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

import Dashboard from '../Dashboard.js';
import BatchQRScanner from '../../components/BatchQRScanner.js';

// Mock AuthContext to provide a user
jest.mock('../../context/AuthContext.js', () => ({
  useAuth: () => ({ user: { id: 'user123', email: 'test@example.com' }, status: 'SIGNED_IN', loading: false })
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

// Mock batch service used by BatchQRScanner
jest.mock('../../services/batchService.js', () => ({
  __esModule: true,
  batchService: {
    verifyBatchAndUpdateUser: jest.fn().mockResolvedValue({
      data: {
        batch_id: 'BATCH-123',
        bagsAdded: 4,
        created_at: new Date().toISOString(),
        bags: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }, { id: 'b4' }]
      },
      error: null,
    }),
    // Provide no-op implementations for other methods possibly referenced
    isBatchLocallyScanned: jest.fn().mockReturnValue(false),
    enqueueBatchActivation: jest.fn().mockResolvedValue({ data: { queued: true }, error: null }),
  }
}));

// Mock notification service
jest.mock('../../services/notificationService.js', () => ({
  notificationService: {
    createNotification: jest.fn().mockResolvedValue({ data: { id: 'n1' }, error: null })
  }
}));

// Mock supabase client minimal for both Dashboard and Scanner
jest.mock('../../utils/supabaseClient.js', () => ({
  __esModule: true,
  default: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      refreshSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  },
}));

// Mock realtime subscriptions to no-op so only the event drives the change
jest.mock('../../utils/realtime.js', () => ({
  subscribeToStatsUpdates: () => ({ unsubscribe: jest.fn() }),
  handleStatsUpdate: (tableType, payload, prev) => prev,
  subscribeToDumpingReports: () => ({ unsubscribe: jest.fn() }),
  handleDumpingReportUpdate: (payload, cb) => cb && cb()
}));

// Mock offline storage (support both default and named exports)
jest.mock('../../utils/offlineStorage.js', () => {
  const api = {
    cacheUserStats: jest.fn(),
    getCachedUserStats: jest.fn().mockResolvedValue(null),
    cacheUserActivity: jest.fn(),
    getCachedUserActivity: jest.fn().mockResolvedValue([]),
    isOnline: () => false,
  };
  return {
    __esModule: true,
    default: api,
    ...api,
  };
});

// Mock the QR scanner to provide a button we can click to simulate scan
jest.mock('react-qr-scanner', () =>
  function MockQrScanner({ onScan, onError }) {
    return (
      <div data-testid="mock-qr-reader">
        <button onClick={() => onScan({ text: 'BATCH-123' })}>Simulate Scan</button>
        <button onClick={() => onError && onError(new Error('permission denied'))}>Simulate Error</button>
      </div>
    );
  }
);

describe('Integration: Batch scan updates Dashboard bags via event', () => {
  it('Dashboard reflects increased bags after BatchQRScanner dispatches event', async () => {
    // Ensure online path is taken
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });

    await act(async () => {
      render(
        <MemoryRouter>
          <div>
            <Dashboard />
            <BatchQRScanner />
          </div>
        </MemoryRouter>
      );
    });

    // Start scanning and simulate a scan
    await act(async () => {
      fireEvent.click(screen.getByText('Start Scanning'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Simulate Scan'));
    });

    // The Dashboard listens for 'trashdrop:bags-updated' and should show 4 somewhere
    await waitFor(() => {
      expect(screen.getAllByText('4').length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });
});
