import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { collectorService } from '../../services/collectorService.js';
import { useAuth } from '../../context/AuthContext.js';
import GeolocationService from '../../utils/geolocationService.js';

// Mock the services and hooks
jest.mock('../../services/collectorService.js');
jest.mock('../../context/AuthContext.js');
jest.mock('../../utils/geolocationService.js', () => ({
  __esModule: true,
  default: {
    getCurrentPosition: jest.fn(),
  },
}));
// Mock Leaflet components
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children, eventHandlers }) => (
    <div 
      data-testid="marker" 
      onClick={eventHandlers?.click}
    >
      {children}
    </div>
  ),
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({}),
}));

// Mock Leaflet itself
jest.mock('leaflet', () => {
  const mockDefault = {
    prototype: { _getIconUrl: jest.fn() },
    mergeOptions: jest.fn(),
  };
  const Icon = function Icon() { return {}; };
  Icon.Default = mockDefault;
  return { Icon };
});

// Import the component AFTER mocks are set up
import CollectorMap from '../CollectorMap.js';

describe('CollectorMap', () => {
  const mockUser = { id: 'user123', is_collector: false };
  const mockCollector = {
    id: 'collector123',
    status: 'active',
    current_location: {
      latitude: 37.7749,
      longitude: -122.4194
    },
    last_update: '2025-07-21T20:00:00Z'
  };
  const mockLocation = {
    lat: 37.7749,
    lng: -122.4194
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: mockUser });

    // Mock geolocation
    const mockGeolocation = {
      getCurrentPosition: jest.fn().mockImplementation((success) =>
        success({
          coords: {
            latitude: mockLocation.lat,
            longitude: mockLocation.lng
          }
        })
      )
    };
    global.navigator.geolocation = mockGeolocation;

    // Mock service responses
    collectorService.getNearbyCollectors.mockResolvedValue({
      data: [mockCollector],
      error: null
    });
    GeolocationService.getCurrentPosition.mockResolvedValue({
      success: true,
      coords: {
        latitude: mockLocation.lat,
        longitude: mockLocation.lng
      }
    });
    collectorService.updateLocation.mockResolvedValue({
      data: null,
      error: null
    });
    collectorService.getActiveSession.mockResolvedValue({
      data: null,
      error: null
    });
    collectorService.startSession.mockResolvedValue({
      data: { id: 'session123' },
      error: null
    });
    collectorService.endActiveSession.mockResolvedValue({
      data: null,
      error: null
    });
  });

  it('renders with pickup location', async () => {
    const pickupLocation = { lat: mockLocation.lat, lng: mockLocation.lng };
    await act(async () => {
      render(<CollectorMap pickupLocation={pickupLocation} />);
    });

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Check map and marker
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    const markers = screen.getAllByTestId('marker');
    expect(markers).toHaveLength(2); // Pickup location + collector
  });

  it('displays nearby collectors', async () => {
    const pickupLocation = { lat: mockLocation.lat, lng: mockLocation.lng };
    await act(async () => {
      render(<CollectorMap pickupLocation={pickupLocation} />);
    });

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Check collectors
    const markers = screen.getAllByTestId('marker');
    expect(markers).toHaveLength(2);
    expect(screen.getByText('1 collectors found nearby')).toBeInTheDocument();

    expect(collectorService.getNearbyCollectors).toHaveBeenCalledWith(
      pickupLocation,
      5
    );
  });

  it('handles geolocation error', async () => {
    // Force GeolocationService to return a failure result so component sets the error message
    GeolocationService.getCurrentPosition.mockResolvedValueOnce({
      success: false,
      coords: { latitude: 5.614736, longitude: -0.208811 },
      error: { code: 3, message: 'TIMEOUT' }
    });

    render(<CollectorMap />);

    await waitFor(() => {
      expect(
        screen.getByText('Using approximate location. Location services may be disabled.')
      ).toBeInTheDocument();
    });
  });

  it('uses pickup location when provided', async () => {
    const pickupLocation = {
      lat: 38.7749,
      lng: -123.4194
    };

    await act(async () => {
      render(<CollectorMap pickupLocation={pickupLocation} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Pickup Location')).toBeInTheDocument();
    });

    expect(collectorService.getNearbyCollectors).toHaveBeenCalledWith(
      pickupLocation,
      5
    );
  });

  it('handles collector session for collector users', async () => {
    // Mock user as collector
    useAuth.mockReturnValue({ user: { ...mockUser, is_collector: true } });

    // Mock active session
    const mockSession = {
      id: 'session123',
      collector_id: 'user123',
      status: 'active'
    };
    collectorService.getActiveSession.mockResolvedValueOnce({
      data: mockSession,
      error: null
    });

    const onCollectorLocationUpdate = jest.fn();
    render(<CollectorMap onCollectorLocationUpdate={onCollectorLocationUpdate} />);

    await waitFor(() => {
      expect(collectorService.getActiveSession).toHaveBeenCalledWith('user123');
      expect(collectorService.updateLocation).toHaveBeenCalledWith(
        'session123',
        mockLocation
      );
      expect(onCollectorLocationUpdate).toHaveBeenCalledWith(mockLocation);
    });
  });

  it('starts new session for collector without active session', async () => {
    // Mock user as collector
    useAuth.mockReturnValue({ user: { ...mockUser, is_collector: true } });

    // Mock session creation
    const mockSession = {
      id: 'session123',
      collector_id: 'user123',
      status: 'active'
    };
    collectorService.startSession.mockResolvedValueOnce({
      data: mockSession,
      error: null
    });

    render(<CollectorMap />);

    await waitFor(() => {
      expect(collectorService.startSession).toHaveBeenCalledWith(
        'user123',
        mockLocation
      );
    });
  });

  it('handles service errors gracefully', async () => {
    collectorService.getNearbyCollectors.mockResolvedValueOnce({
      data: null,
      error: { message: 'Failed to fetch collectors' }
    });

    render(<CollectorMap />);

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch nearby collectors')).toBeInTheDocument();
    });
  });

  it('refreshes collector locations periodically', async () => {
    jest.useFakeTimers();

    render(<CollectorMap />);

    // Initial fetch
    await waitFor(() => {
      expect(collectorService.getNearbyCollectors).toHaveBeenCalledTimes(1);
    });

    // Advance timers by 30 seconds
    act(() => {
      jest.advanceTimersByTime(30000);
    });

    // Check for second fetch
    expect(collectorService.getNearbyCollectors).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it('cleans up collector session on unmount', async () => {
    // Mock user as collector
    useAuth.mockReturnValue({ user: { ...mockUser, is_collector: true } });

    const { unmount } = render(<CollectorMap />);

    unmount();

    await waitFor(() => {
      expect(collectorService.endActiveSession).toHaveBeenCalledWith('user123');
    });
  });

  it('displays collector info when marker is clicked', async () => {
    await act(async () => {
      render(<CollectorMap />);
    });

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Find and click the collector marker
    const markers = screen.getAllByTestId('marker');
    // Click the second marker (collector)
    fireEvent.click(markers[1]);

    await waitFor(() => {
      expect(screen.getByText('Select Collector')).toBeInTheDocument();
    });
    // Popup content should include status line
    expect(screen.getByText(/Status:\s*active/)).toBeInTheDocument();
  });
});
