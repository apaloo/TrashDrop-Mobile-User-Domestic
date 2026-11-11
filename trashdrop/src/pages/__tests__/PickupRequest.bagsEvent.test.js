import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import PickupRequest from '../PickupRequest.js';

jest.setTimeout(15000);

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

// Bag totals come from the same stats service as the dashboard
jest.mock('../../services/userServiceOptimized.js', () => ({
  userServiceOptimized: {
    getUserStatsOptimized: () => Promise.resolve({ data: { totalBags: 0, batches: 0 }, error: null }),
  },
}));

// Mock realtime to avoid auto-changing values
jest.mock('../../utils/realtime.js', () => ({
  subscribeToStatsUpdates: () => ({ unsubscribe: jest.fn() })
}));

const bagsUpdated = (detail) =>
  act(async () => {
    window.dispatchEvent(new CustomEvent('trashdrop:bags-updated', { detail }));
  });

describe('PickupRequest submit gating via global bags event', () => {
  const renderPage = () => render(
    <MemoryRouter>
      <PickupRequest />
    </MemoryRouter>
  );

  it('with no bags, Request Pickup is disabled and says why', async () => {
    renderPage();
    const submitBtn = await screen.findByRole('button', { name: /request pickup/i });
    await waitFor(() => expect(submitBtn).toBeDisabled());
    expect(screen.getByRole('alert')).toHaveTextContent('No bags available');
  });

  it('enables submit after a trashdrop:bags-updated event for this user', async () => {
    renderPage();
    const submitBtn = await screen.findByRole('button', { name: /request pickup/i });
    await waitFor(() => expect(submitBtn).toBeDisabled());

    await bagsUpdated({ userId: 'user123', deltaBags: 3, source: 'test' });

    await waitFor(() => expect(submitBtn).not.toBeDisabled());
    expect(screen.queryByText('No bags available. Scan a batch to enable pickup.')).toBeNull();
  });

  it("ignores another user's bags-updated event", async () => {
    renderPage();
    const submitBtn = await screen.findByRole('button', { name: /request pickup/i });
    await waitFor(() => expect(submitBtn).toBeDisabled());

    await bagsUpdated({ userId: 'someone-else', deltaBags: 3, source: 'test' });

    expect(submitBtn).toBeDisabled();
  });
});
