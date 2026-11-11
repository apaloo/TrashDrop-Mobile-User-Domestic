import React from 'react';
// Increase timeout for this test file
jest.setTimeout(15000);
import { render, screen, waitFor, waitForElementToBeRemoved, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import PickupRequest from '../PickupRequest.js';

// Mock react-leaflet heavy components
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => <div data-testid="tile" />,
  Marker: () => <div data-testid="marker" />,
  useMapEvents: () => ({}),
  // The page's map helper recentres the map; a stand-in with the calls it makes
  useMap: () => ({ setView: () => {}, flyTo: () => {}, getZoom: () => 15, invalidateSize: () => {} })
}));

// Mock AuthContext
// One user object, as the real context keeps it: a new object each render
// would refetch stats on every render
jest.mock('../../context/AuthContext.js', () => {
  const auth = { user: { id: 'user123', email: 'test@example.com' } };
  return { useAuth: () => auth };
});

// Mock supabase client used inside the page. Every query chain (select, eq,
// in, order, limit…) returns itself and resolves to an empty result, so the
// page can build whatever query it needs; user_stats reads come back as zero.
jest.mock('../../utils/supabaseClient.js', () => {
  const query = (table) => {
    const result = table === 'user_stats'
      ? { data: { total_bags: 0, total_batches: 0 }, error: null }
      : { data: [], error: null };
    const builder = new Proxy({}, {
      get: (_, prop) => {
        if (prop === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => Promise.resolve(table === 'user_stats' ? result : { data: null, error: null });
        }
        return () => builder;
      },
    });
    return builder;
  };
  const channel = { on: () => channel, subscribe: () => ({ unsubscribe: () => {} }), unsubscribe: () => {} };
  return {
    __esModule: true,
    default: { from: query, channel: () => channel, removeChannel: () => {}, rpc: () => Promise.resolve({ data: null, error: null }) },
    from: query,
    channel: () => channel,
    removeChannel: () => {},
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
});

// Bag totals load from the stats service as zero; the realtime update brings 5
jest.mock('../../services/userServiceOptimized.js', () => ({
  userServiceOptimized: {
    getUserStatsOptimized: () => Promise.resolve({ data: { totalBags: 0, batches: 0 }, error: null }),
  },
}));

// Capture the handler passed to subscribeToStatsUpdates
const mockSubscribeSpy = jest.fn();
let mockCapturedHandler = null;

jest.mock('../../utils/realtime.js', () => ({
  subscribeToStatsUpdates: (userId, onUpdate) => {
    mockCapturedHandler = onUpdate;
    mockSubscribeSpy(userId);
    // Auto-emit a realtime payload to update totals deterministically
    setTimeout(() => {
      // Ensure React flushes state updates (required lazily: jest.mock
      // factories can't use imports from the test file)
      const { act: mockAct } = require('@testing-library/react');
      mockAct(() => {
        onUpdate('user_stats', { new: { total_bags: 5, total_batches: 2 } });
      });
    }, 0);
    return { unsubscribe: jest.fn() };
  }
}));

describe('PickupRequest realtime stats integration', () => {
  // Increase timeout for async UI updates
  beforeAll(() => {
    jest.setTimeout(15000);
  });
  
  it('updates available bags when user_stats realtime payload arrives', async () => {
    render(
      <MemoryRouter>
        <PickupRequest />
      </MemoryRouter>
    );

    // Ensure subscription registered
    await waitFor(() => {
      expect(mockSubscribeSpy).toHaveBeenCalled();
    });

    // The number of bags select should be enabled and include up to 5 bags
    const select = await screen.findByLabelText(/number of bags/i, { selector: 'select' });
    expect(select).toBeEnabled();
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /5 bags?/i })).toBeInTheDocument();
    }, { timeout: 8000 });
  });
});
