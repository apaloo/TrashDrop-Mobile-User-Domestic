import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import UberStyleTrackingMap from '../UberStyleTrackingMap.js';

jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Popup: () => null,
  Polyline: () => <span data-testid="route" />,
  ZoomControl: () => null,
  useMap: () => ({ getContainer: () => null }),
}));

const sheet = (status) => render(
  <UberStyleTrackingMap
    collectorLocation={{ lat: 5.6, lng: -0.18 }}
    pickupLocation={{ lat: 5.61, lng: -0.18 }}
    distance={30}
    eta={1}
    loading={false}
    activePickup={{ id: 'b1', status, is_digital_bin: true, collector: { first_name: 'Gettina', last_name: 'Omane', phone: '020' } }}
  />
);

describe('the tracking sheet once the collector has the waste', () => {
  it('says it is picked up and heading for disposal, with nothing to cancel', () => {
    sheet('collecting');
    expect(screen.getByText('Waste picked up')).toBeInTheDocument();
    expect(screen.getByText("On its way to a disposal site. You'll be notified when it's disposed.")).toBeInTheDocument();
    expect(screen.queryByText('Collector is here')).not.toBeInTheDocument();
    expect(screen.queryByText('Here')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /QR code/ })).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('route')).toHaveLength(0);
    expect(screen.getByText('4 of 5 done · Next: Disposed')).toBeInTheDocument();
  });

  it('says it is disposed once the collector drops it at a site', () => {
    sheet('disposed');
    expect(screen.getByText('Waste disposed')).toBeInTheDocument();
    expect(screen.getByText('Disposed at an approved site.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('still lets the household cancel before pickup', () => {
    sheet('arrived');
    expect(screen.getByText('Collector is here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryAllByTestId('route').length).toBeGreaterThan(0);
  });
});
