// Jest manual mock for react-leaflet to avoid ESM parsing and heavy Leaflet setup in tests.
// Provides lightweight stand-ins for the components/hooks we use.

const React = require('react');

function Noop({ children, ...props }) {
  return React.createElement('div', props, children);
}

const MapContainer = ({ children, ...props }) => React.createElement('div', { 'data-testid': 'mock-map', ...props }, children);
const TileLayer = (props) => React.createElement(Noop, { 'data-testid': 'mock-tile', ...props });
const Marker = ({ children, ...props }) => React.createElement('div', { 'data-testid': 'mock-marker', ...props }, children);
const Popup = ({ children, ...props }) => React.createElement('div', { 'data-testid': 'mock-popup', ...props }, children);

function useMapEvents() {
  return {};
}

function useMap() {
  return {
    setView: jest.fn(),
  };
}

module.exports = {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  useMap,
};
