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

// Capture the handler passed to subscribeToStatsUpdates
const mockSubscribeSpy = jest.fn();
let mockCapturedHandler = null;

jest.mock('../../utils/realtime.js', () => ({
  subscribeToStatsUpdates: (userId, onUpdate) => {
    mockCapturedHandler = onUpdate;
    mockSubscribeSpy(userId);
    // Auto-emit a realtime payload to update totals deterministically
    setTimeout(() => {
      // Ensure React flushes state updates
      act(() => {
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
