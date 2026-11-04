import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import CollectorTracking from '../CollectorTracking.js';
import { pickupService } from '../../services/pickupService.js';
import { subscribeToCollectorLocation } from '../../utils/realtime.js';
import supabase from '../../utils/supabaseClient.js';

// One user object, as the real auth context keeps (a new one each render would reload the pickup)
const mockAuth = { user: { id: 'u1' } };
jest.mock('../../context/AuthContext.js', () => ({ useAuth: () => mockAuth }));
jest.mock('../../services/pickupService.js', () => ({ pickupService: { getPickupDetails: jest.fn(), getActivePickup: jest.fn() } }));
jest.mock('../../utils/realtime.js', () => ({ subscribeToCollectorLocation: jest.fn(), calculateETA: jest.fn(() => null) }));
jest.mock('../../utils/geolocationService.js', () => ({ __esModule: true, default: { getCurrentPosition: jest.fn(() => Promise.resolve({ success: false })) } }));
jest.mock('../../utils/toastNotifications.js', () => ({ showDistanceAlert: jest.fn(), showStatusNotification: jest.fn() }));
jest.mock('../../utils/supabaseClient.js', () => ({ __esModule: true, default: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() } }));

// What the page hands the map, so the test can see the collector's position
const mapProps = [];
jest.mock('../../components/UberStyleTrackingMap.js', () => (props) => { mapProps.push(props); return null; });

let onStatusChange;
const unsubscribe = jest.fn();
const profileReads = jest.fn();

const pickup = (status) => ({
  id: 'bin-1', status, is_digital_bin: true, collector_id: 'col-1',
  location: { latitude: 5.6, longitude: -0.18 }, coordinates: { latitude: 5.6, longitude: -0.18 },
});

const open = (status) => {
  pickupService.getPickupDetails.mockResolvedValue({ data: pickup(status), error: null });
  return render(
    <MemoryRouter initialEntries={['/collector-tracking?pickupId=bin-1']}>
      <CollectorTracking />
    </MemoryRouter>
  );
};

describe("Following the collector's location", () => {
  beforeEach(() => {
    mapProps.length = 0;
    subscribeToCollectorLocation.mockReturnValue({ unsubscribe });
    supabase.channel.mockImplementation(() => {
      const channel = { on: (_e, _f, handler) => { onStatusChange = handler; return channel; }, subscribe: () => channel };
      return channel;
    });
    supabase.from.mockImplementation((table) => {
      if (table === 'collector_profiles') profileReads();
      const chain = { select: () => chain, eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: { current_latitude: 5.61, current_longitude: -0.18 }, error: null }) };
      return chain;
    });
  });

  it('follows the collector on the way, and stops for good once they have the waste', async () => {
    open('accepted');
    await waitFor(() => expect(subscribeToCollectorLocation).toHaveBeenCalledWith('col-1', 'bin-1', expect.any(Function)));
    await waitFor(() => expect(mapProps[mapProps.length - 1].collectorLocation).toEqual({ lat: 5.61, lng: -0.18 }));
    const readsBefore = profileReads.mock.calls.length;
    const subscriptionsBefore = subscribeToCollectorLocation.mock.calls.length;

    // The collector scans the bin
    act(() => onStatusChange({ new: { status: 'collecting' } }));

    await waitFor(() => expect(unsubscribe).toHaveBeenCalled());
    const last = mapProps[mapProps.length - 1];
    expect(last.collectorLocation).toBeNull();
    expect(last.distance).toBeNull();
    expect(last.eta).toBeNull();
    // No new subscription and no new read of their position
    expect(subscribeToCollectorLocation.mock.calls.length).toBe(subscriptionsBefore);
    // Every subscription opened has been closed
    expect(unsubscribe.mock.calls.length).toBe(subscriptionsBefore);
    expect(profileReads.mock.calls.length).toBe(readsBefore);
  });

  it('never follows the collector when the pickup is already collected or disposed', async () => {
    for (const status of ['collecting', 'disposed']) {
      const { unmount } = open(status);
      await waitFor(() => expect(mapProps.length).toBeGreaterThan(0));
      expect(subscribeToCollectorLocation).not.toHaveBeenCalled();
      expect(profileReads).not.toHaveBeenCalled();
      expect(mapProps[mapProps.length - 1].collectorLocation).toBeNull();
      unmount();
    }
  });
});
