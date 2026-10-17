import React, { useState } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import LocationStep from '../LocationStep.js';

// The manual react-leaflet mock returns {} from useMapEvents; MapUpdater needs a map
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
jest.mock('../../../utils/supabaseClient.js', () => ({ __esModule: true, default: {} }));
jest.mock('../../../context/AuthContext.js', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../../../services/toastService.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../utils/geolocationService.js', () => ({
  __esModule: true,
  default: { getCurrentPosition: jest.fn() },
}));
// Plain functions, not jest.fn(): CRA's resetMocks wipes mock implementations before each test
let mockCoverageResult = { status: 'covered', zone: { suburb: 'Test' } };
const mockWaitlistCalls = [];
jest.mock('../../../services/serviceCoverageService.js', () => ({
  checkServiceCoverage: async () => mockCoverageResult,
  joinCoverageWaitlist: async (...args) => { mockWaitlistCalls.push(args); return true; },
}));

const POKUASE = [5.6806, -0.2826];
const KINTAMPO = [8.05, -1.73];

// Reverse geocoding answers with a name per latitude
const placeFor = (url) => {
  const lat = parseFloat(new URL(url).searchParams.get('lat'));
  if (Math.abs(lat - KINTAMPO[0]) < 0.01) return 'Kintampo, Bono East, Ghana';
  return `Somewhere at ${lat}`;
};

// LocationStep's parent owns formData; this stands in for DigitalBin.js
let setParentFormData;
const Harness = ({ initial }) => {
  const [formData, setFormData] = useState(initial);
  setParentFormData = setFormData;
  return (
    <LocationStep
      formData={formData}
      updateFormData={(d) => setFormData(prev => ({ ...prev, ...d }))}
      nextStep={jest.fn()}
    />
  );
};

const addressField = () => screen.getByLabelText('Address');

beforeEach(() => {
  mockCoverageResult = { status: 'covered', zone: { suburb: 'Test' } };
  mockWaitlistCalls.length = 0;
  global.fetch = jest.fn(async (url) => ({ ok: true, json: async () => ({ display_name: placeFor(url) }) }));
});

describe('LocationStep address follows the pin', () => {
  it('replaces an address left over from an earlier pin when the step mounts', async () => {
    render(<Harness initial={{
      latitude: KINTAMPO[0], longitude: KINTAMPO[1], useCurrentLocation: true,
      address: 'Ayawaso, Pokuase', address_coords: POKUASE,
    }} />);

    // The stale address is never shown, and Continue waits for the lookup
    expect(addressField()).toHaveValue('');
    expect(addressField()).toHaveAttribute('placeholder', 'Looking up address...');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await waitFor(() => expect(addressField()).toHaveValue('Kintampo, Bono East, Ghana'), { timeout: 3000 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
  });

  it('looks the address up again when GPS refinement moves the pin far', async () => {
    render(<Harness initial={{
      latitude: POKUASE[0], longitude: POKUASE[1], useCurrentLocation: true,
      address: 'Ayawaso, Pokuase', address_coords: POKUASE,
    }} />);
    expect(addressField()).toHaveValue('Ayawaso, Pokuase');

    act(() => setParentFormData(prev => ({ ...prev, latitude: KINTAMPO[0], longitude: KINTAMPO[1] })));

    await waitFor(() => expect(addressField()).toHaveValue('Kintampo, Bono East, Ghana'), { timeout: 3000 });
  });

  it('keeps the address when refinement nudges the pin a few metres', async () => {
    render(<Harness initial={{
      latitude: POKUASE[0], longitude: POKUASE[1], useCurrentLocation: true,
      address: 'Ayawaso, Pokuase', address_coords: POKUASE,
    }} />);

    act(() => setParentFormData(prev => ({ ...prev, latitude: POKUASE[0] + 0.0001 }))); // ~11 m

    await new Promise(resolve => setTimeout(resolve, 800)); // past the lookup debounce
    expect(addressField()).toHaveValue('Ayawaso, Pokuase');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('LocationStep outside coverage', () => {
  it('offers to notify the user and adds the pin to the waitlist', async () => {
    mockCoverageResult = { status: 'not_covered', zone: { suburb: 'Berlin Top', distance_km: 101.84 } };
    render(<Harness initial={{
      latitude: KINTAMPO[0], longitude: KINTAMPO[1], useCurrentLocation: true,
      address: 'Kintampo, Bono East, Ghana', address_coords: KINTAMPO,
    }} />);

    const notify = await screen.findByRole('button', { name: 'Notify me when you arrive' });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    act(() => { notify.click(); });

    await screen.findByText(/You're on the list/);
    expect(mockWaitlistCalls).toEqual([[KINTAMPO[0], KINTAMPO[1], 'Kintampo, Bono East, Ghana']]);
  });
});
