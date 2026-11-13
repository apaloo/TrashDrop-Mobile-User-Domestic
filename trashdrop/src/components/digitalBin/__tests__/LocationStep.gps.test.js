import React, { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocationStep from '../LocationStep.js';
import GeolocationService from '../../../utils/geolocationService.js';
import toastService from '../../../services/toastService.js';

// The booking's location step and the phone's GPS: the fix taken when the
// step opens, the "Get my current location" button, what Continue refuses,
// the service-area retry, and the saved places it loads (TD65: none of them
// can be booked without GPS yet). LocationStep.address.test.js covers the
// address, LocationStep.locationRequired.test.js the location-off prompt.
jest.mock('react-leaflet', () => {
  const React = require('react');
  const map = { setView: () => {}, flyTo: () => {}, getZoom: () => 13 };
  return {
    MapContainer: ({ children }) => React.createElement('div', null, children),
    TileLayer: () => null,
    Marker: () => null,
    useMapEvents: () => map,
  };
});
jest.mock('leaflet', () => ({
  __esModule: true,
  default: { Icon: { Default: { prototype: {}, mergeOptions: jest.fn() } } },
}));

// Each table answers with its rows (set per test)
let mockTables = {};
jest.mock('../../../utils/supabaseClient.js', () => ({
  __esModule: true,
  default: {
    from: (table) => {
      const q = {
        select: () => q, eq: () => q,
        order: async () => mockTables[table] || { data: [], error: null },
      };
      return q;
    },
  },
}));
let mockUser = null;
jest.mock('../../../context/AuthContext.js', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../../services/toastService.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../utils/geolocationService.js', () => ({
  __esModule: true,
  default: { getCurrentPosition: jest.fn(), REQUIRED_ACCURACY_METERS: 10 },
}));
let mockCoverage = { status: 'covered', zone: { suburb: 'Osu' } };
let mockCoverageChecks = 0;
jest.mock('../../../services/serviceCoverageService.js', () => ({
  checkServiceCoverage: async () => { mockCoverageChecks += 1; return mockCoverage; },
  joinCoverageWaitlist: async () => true,
}));

const OSU = { latitude: 5.556, longitude: -0.1969, accuracy: 6 };
const fix = (coords = OSU, extra = {}) => ({ success: true, coords, ...extra });
const failure = (code, message = 'failed') => ({ success: false, error: { code, message } });

let nextStep;
let latest;
const Harness = ({ initial = {} }) => {
  const [formData, setFormData] = useState(initial);
  latest = formData;
  return (
    <LocationStep
      formData={formData}
      updateFormData={(d) => setFormData((prev) => ({ ...prev, ...d }))}
      nextStep={nextStep}
    />
  );
};
const continueButton = () => screen.getByRole('button', { name: 'Continue' });

beforeEach(() => {
  nextStep = jest.fn();
  mockUser = null;
  mockTables = {};
  mockCoverage = { status: 'covered', zone: { suburb: 'Osu' } };
  mockCoverageChecks = 0;
  localStorage.clear();
  global.navigator.geolocation = { getCurrentPosition: jest.fn() };
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ display_name: 'Osu, Accra, Ghana' }) }));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the GPS fix taken when the step opens', () => {
  it('fills in the spot, files the bin against it (not a saved place) and lets the household continue', async () => {
    GeolocationService.getCurrentPosition.mockResolvedValue(fix());
    render(<Harness initial={{ location_id: 'old-place' }} />);

    await screen.findByRole('button', { name: /Location captured/ });
    expect(GeolocationService.getCurrentPosition).toHaveBeenCalledWith(expect.objectContaining({ enableHighAccuracy: true, maximumAge: 0 }));
    expect(latest).toMatchObject({ latitude: OSU.latitude, longitude: OSU.longitude, gps_accuracy: 6, useCurrentLocation: true, location_id: null });

    await waitFor(() => expect(continueButton()).toBeEnabled());
    await waitFor(() => expect(screen.getByLabelText('Address')).toHaveValue('Osu, Accra, Ghana'));
    await userEvent.click(continueButton());
    expect(nextStep).toHaveBeenCalledTimes(1);
    expect(latest).toMatchObject({ latitude: OSU.latitude, longitude: OSU.longitude, address: 'Osu, Accra, Ghana' });
  });

  it('a rough fix is accepted, with advice to move into the open', async () => {
    GeolocationService.getCurrentPosition.mockResolvedValue(fix({ ...OSU, accuracy: 48 }, { accuracyWarning: true }));
    render(<Harness />);
    expect(await screen.findByText(/GPS accuracy is 48m\. For better accuracy, move to an open area/)).toBeInTheDocument();
    expect(latest.useCurrentLocation).toBe(true);
  });

  it('a spot already chosen is kept: GPS is not asked again', async () => {
    render(<Harness initial={{ latitude: OSU.latitude, longitude: OSU.longitude, useCurrentLocation: true }} />);
    await waitFor(() => expect(screen.getByLabelText('Address')).toHaveValue('Osu, Accra, Ghana'));
    expect(GeolocationService.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('a phone without geolocation is not asked, and nothing is filled in', async () => {
    delete global.navigator.geolocation;
    render(<Harness />);
    expect(await screen.findByRole('button', { name: /Get my current location/ })).toBeEnabled();
    expect(GeolocationService.getCurrentPosition).not.toHaveBeenCalled();
    expect(latest.useCurrentLocation).toBeFalsy();
    expect(latest.latitude ?? null).toBeNull();
  });
});

describe('"Get my current location"', () => {
  const openWithoutFix = async () => {
    GeolocationService.getCurrentPosition.mockResolvedValueOnce(failure(3, 'Timeout expired'));
    render(<Harness />);
    return screen.findByRole('button', { name: /Get my current location/ });
  };

  it('takes a fresh fix and says how accurate it is', async () => {
    const button = await openWithoutFix();
    GeolocationService.getCurrentPosition.mockResolvedValueOnce(fix());
    await userEvent.click(button);
    await screen.findByRole('button', { name: /Location captured/ });
    expect(toastService.success).toHaveBeenCalledWith('Location obtained! (Accuracy: 6.0m)');
    expect(latest).toMatchObject({ useCurrentLocation: true, location_id: null });
  });

  it('a rough fix is accepted, with a note to move outdoors', async () => {
    const button = await openWithoutFix();
    GeolocationService.getCurrentPosition.mockResolvedValueOnce(fix({ ...OSU, accuracy: 35 }, { accuracyWarning: true }));
    await userEvent.click(button);
    await waitFor(() => expect(toastService.info).toHaveBeenCalledWith('Location captured (35m accuracy). Move outdoors for better precision.'));
  });

  it('a GPS timeout is reported and the booking cannot continue', async () => {
    const button = await openWithoutFix();
    GeolocationService.getCurrentPosition.mockResolvedValueOnce(failure(3, 'Timeout expired'));
    await userEvent.click(button);
    await waitFor(() => expect(toastService.error).toHaveBeenCalledWith('GPS Error: Timeout expired'));
    expect(latest.useCurrentLocation).toBe(false);
    expect(screen.getByRole('button', { name: /Get my current location/ })).toBeEnabled();
  });

  it('a GPS service that throws gets the general advice, never a made-up spot', async () => {
    const button = await openWithoutFix();
    GeolocationService.getCurrentPosition.mockRejectedValueOnce(new Error('boom'));
    await userEvent.click(button);
    await waitFor(() => expect(toastService.error).toHaveBeenCalledWith('Could not get GPS location. Please ensure location services are enabled and you are in an open area.'));
    expect(latest.latitude ?? null).toBeNull();
    expect(latest.useCurrentLocation).toBe(false);
  });
});

describe('Continue', () => {
  it('without a spot, says to choose one', async () => {
    GeolocationService.getCurrentPosition.mockResolvedValue(failure(3));
    render(<Harness />);
    await screen.findByRole('button', { name: /Get my current location/ });
    await userEvent.click(continueButton());
    expect(screen.getByText('Please select a valid location on the map')).toBeInTheDocument();
    expect(nextStep).not.toHaveBeenCalled();
  });

  it('with a spot that did not come from GPS, asks for the current location (TD65)', async () => {
    render(<Harness initial={{ latitude: OSU.latitude, longitude: OSU.longitude, useCurrentLocation: false }} />);
    await waitFor(() => expect(continueButton()).toBeEnabled());
    await userEvent.click(continueButton());
    expect(screen.getByText('Please use your current location to continue')).toBeInTheDocument();
    expect(nextStep).not.toHaveBeenCalled();
  });

  it('when the service area check fails, "Try again" asks again and then lets the household continue', async () => {
    mockCoverage = { status: 'unavailable' };
    render(<Harness initial={{ latitude: OSU.latitude, longitude: OSU.longitude, useCurrentLocation: true }} />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(continueButton()).toBeDisabled();
    const checksBefore = mockCoverageChecks;
    mockCoverage = { status: 'covered', zone: { suburb: 'Osu' } };
    await userEvent.click(retry);
    await waitFor(() => expect(mockCoverageChecks).toBe(checksBefore + 1));
    await waitFor(() => expect(continueButton()).toBeEnabled());
  });
});

describe('saved places (loaded, though booking needs GPS: TD65)', () => {
  it('reads bin_locations and the old locations table, drops duplicates, and keeps places not yet sent', async () => {
    mockUser = { id: 'u1' };
    localStorage.setItem('trashdrop_locations_u1', JSON.stringify([
      { id: 'local_1', name: 'Gate', address: 'Unsent street' },
      { id: 'local_2', name: 'Home', address: 'Osu' },
    ]));
    mockTables = {
      bin_locations: { data: [{ id: 'b1', location_name: 'Home', address: 'Osu' }], error: null },
      locations: { data: [{ id: 'l1', name: 'Home', address: 'Osu' }, { id: 'l2', name: 'Shop', address: 'Labone' }], error: null },
    };
    render(<Harness initial={{ latitude: OSU.latitude, longitude: OSU.longitude, useCurrentLocation: true }} />);

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('trashdrop_locations_u1'));
      expect(saved.map((l) => `${l.id}:${l.source || 'local'}`)).toEqual(['b1:bin_locations', 'l2:locations', 'local_1:local']);
    });
  });

  it('a failed read of both tables leaves what the phone had', async () => {
    mockUser = { id: 'u1' };
    const cached = [{ id: 'b1', name: 'Home', address: 'Osu' }];
    localStorage.setItem('trashdrop_locations_u1', JSON.stringify(cached));
    mockTables = { bin_locations: { data: null, error: { message: 'down' } }, locations: { data: null, error: { message: 'down' } } };
    render(<Harness initial={{ latitude: OSU.latitude, longitude: OSU.longitude, useCurrentLocation: true }} />);
    await waitFor(() => expect(console.error).toHaveBeenCalledWith('Error fetching locations:', expect.anything()));
    expect(JSON.parse(localStorage.getItem('trashdrop_locations_u1'))).toEqual(cached);
  });
});
