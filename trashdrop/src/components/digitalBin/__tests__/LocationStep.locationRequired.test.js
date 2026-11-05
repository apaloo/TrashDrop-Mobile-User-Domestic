import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocationStep from '../LocationStep.js';
import GeolocationService from '../../../utils/geolocationService.js';

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
  default: { getCurrentPosition: jest.fn(), REQUIRED_ACCURACY_METERS: 10 },
}));
jest.mock('../../../services/serviceCoverageService.js', () => ({
  checkServiceCoverage: async () => ({ status: 'covered', zone: { suburb: 'Test' } }),
  joinCoverageWaitlist: async () => true,
}));

const Harness = ({ onCancel }) => {
  const [formData, setFormData] = useState({});
  return (
    <LocationStep
      formData={formData}
      updateFormData={(d) => setFormData(prev => ({ ...prev, ...d }))}
      nextStep={jest.fn()}
      onCancel={onCancel}
    />
  );
};

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ display_name: 'Somewhere' }) }));
  GeolocationService.getCurrentPosition.mockResolvedValue({
    success: false,
    coords: { latitude: null, longitude: null },
    error: { code: 2, message: 'off' },
  });
  global.navigator.geolocation = {
    getCurrentPosition: jest.fn((success) => success({ coords: { latitude: 5.61, longitude: -0.21, accuracy: 6 } })),
  };
});

describe('Digital bin location step with the phone location off', () => {
  it('asks the user to turn location on, and a tap fills the bin location', async () => {
    render(<Harness />);
    expect(await screen.findByRole('alertdialog', { name: /Turn on location to set your bin location/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Turn on location$/i }));
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('can be cancelled when there are no saved places', async () => {
    const onCancel = jest.fn();
    render(<Harness onCancel={onCancel} />);
    await userEvent.click(await screen.findByRole('button', { name: /^Cancel$/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('does not ask when GPS just timed out', async () => {
    GeolocationService.getCurrentPosition.mockResolvedValue({
      success: false, coords: { latitude: null, longitude: null }, error: { code: 3, message: 'slow' },
    });
    render(<Harness />);
    await screen.findByText('Digital Bin Location');
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
