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
  it('disables submit when 0 bags and enables after bags-updated event', async () => {
    const addListenerSpy = jest.spyOn(window, 'addEventListener');

    const { unmount } = render(
      <MemoryRouter>
        <PickupRequest />
      </MemoryRouter>
    );

    // Submit button should be disabled initially (0 bags)
    const submitBtn = await screen.findByRole('button', { name: /request pickup/i });
    expect(submitBtn).toBeDisabled();

    // Disabled-state hint should be visible
    const hint = screen.getByRole('alert');
    expect(hint).toHaveTextContent(/no bags available/i);

    // Wait until the component registers the event listener, then invoke it directly
    let handler;
    await waitFor(() => {
      const call = addListenerSpy.mock.calls.find(c => c[0] === 'trashdrop:bags-updated');
      expect(call).toBeTruthy();
      handler = call[1];
    });

    // Invoke the captured handler with a matching user id and delta
    await act(async () => {
      handler({ detail: { userId: 'user123', deltaBags: 3, source: 'test' } });
    });

    // Wait for UI to reflect optimistic update
    await waitFor(() => {
      expect(submitBtn).not.toBeDisabled();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    addListenerSpy.mockRestore();
    unmount();
  });
});
