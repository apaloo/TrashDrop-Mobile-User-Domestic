// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Use manual mock for react-leaflet across all tests to avoid ESM parsing and heavy Leaflet setup
// The implementation lives in src/__mocks__/react-leaflet.js
jest.mock('react-leaflet');

// jsdom doesn't implement matchMedia; provide a minimal polyfill for components using it
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated but some libs still call it
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
