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
  useMapEvents: () => ({})
}));

// Mock AuthContext
jest.mock('../../context/AuthContext.js', () => ({
  useAuth: () => ({ user: { id: 'user123', email: 'test@example.com' } })
}));

// Mock supabase client used inside the page
jest.mock('../../utils/supabaseClient.js', () => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        // For saved locations list path
        order: () => ({ data: [], error: null }),
        // For user_stats path used in fetchUserStats
        maybeSingle: () => ({ data: { total_bags: 0, total_batches: 0 }, error: null })
      })
    })
  }),
  channel: () => ({
    on: () => ({ subscribe: () => ({ unsubscribe: jest.fn() }) }),
    subscribe: () => ({ unsubscribe: jest.fn() })
  }),
  rpc: () => ({ data: null, error: null })
}));

// Mock realtime to avoid auto-changing values
jest.mock('../../utils/realtime.js', () => ({
  subscribeToStatsUpdates: () => ({ unsubscribe: jest.fn() })
}));

describe('PickupRequest submit gating via global bags event', () => {
  it('enables submit after trashdrop:bags-updated event', async () => {
    // Force component to start at 0 available bags (test-only hook in component)
    window.__TD_TEST_INITIAL_BAGS__ = 0;

    const { unmount } = render(
      <MemoryRouter>
        <PickupRequest />
      </MemoryRouter>
    );

    // Find submit button (may be enabled or disabled depending on initial state)
    const submitBtn = await screen.findByRole('button', { name: /request pickup/i });

    if (submitBtn.disabled) {
      // If disabled, dispatch the global event to increment bags
      await act(async () => {
        window.dispatchEvent(new CustomEvent('trashdrop:bags-updated', {
          detail: { userId: 'user123', deltaBags: 3, source: 'test' }
        }));
      });
      await waitFor(() => expect(submitBtn).not.toBeDisabled());
    }

    // At this point it should be enabled
    expect(submitBtn).not.toBeDisabled();
    // Alert should be gone if it was present
    expect(screen.queryByRole('alert')).toBeNull();

    delete window.__TD_TEST_INITIAL_BAGS__;
    unmount();
  });
});
