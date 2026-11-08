import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import LocationOffBanner from '../LocationOffBanner.js';
import { problemFromError } from '../../hooks/useLocationStatus.js';

const DENIED = { code: 1 };
const UNAVAILABLE = { code: 2 };
const TIMEOUT = { code: 3 };

let getCurrentPosition;
const setPermission = (state) => {
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: jest.fn().mockResolvedValue({ state }) },
  });
};
const failWith = (error) => getCurrentPosition.mockImplementation((ok, fail) => fail(error));
const succeed = () => getCurrentPosition.mockImplementation((ok) => ok({ coords: {} }));
const setOnline = (value) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });

beforeEach(() => {
  getCurrentPosition = jest.fn();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
  setPermission('granted');
  setOnline(true);
});

afterEach(() => setOnline(true));

describe('problemFromError', () => {
  it.each([
    [DENIED, 'denied', 'blocked'],
    [DENIED, 'granted', 'off'],
    [UNAVAILABLE, 'granted', 'off'],
    [TIMEOUT, 'granted', null],
  ])('%j with permission %s -> %s', (error, permission, expected) => {
    expect(problemFromError(error, permission)).toBe(expected);
  });
});

describe('LocationOffBanner', () => {
  it('shows nothing while location works', async () => {
    succeed();
    render(<LocationOffBanner />);
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('asks to turn on when the phone location is off', async () => {
    failWith(UNAVAILABLE);
    render(<LocationOffBanner />);
    expect(await screen.findByRole('button', { name: /Location is off. Tap to turn on/ })).toBeInTheDocument();
  });

  it('says blocked when TrashDrop is not allowed', async () => {
    setPermission('denied');
    failWith(DENIED);
    render(<LocationOffBanner />);
    expect(await screen.findByRole('button', { name: /Location is blocked. Tap to allow/ })).toBeInTheDocument();
  });

  it('a slow GPS fix is not treated as location being off', async () => {
    failWith(TIMEOUT);
    render(<LocationOffBanner />);
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('never opens the permission question without a tap', async () => {
    setPermission('prompt');
    render(<LocationOffBanner />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('asks for location directly from the tap, and clears if it works', async () => {
    failWith(UNAVAILABLE);
    render(<LocationOffBanner />);
    const banner = await screen.findByRole('button', { name: /Tap to turn on/ });
    const callsBefore = getCurrentPosition.mock.calls.length;

    succeed();
    fireEvent.click(banner);

    expect(getCurrentPosition.mock.calls.length).toBe(callsBefore + 1);
    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument());
  });

  it('gives the manual step only after a tap did not fix it', async () => {
    failWith(UNAVAILABLE);
    render(<LocationOffBanner />);
    const banner = await screen.findByRole('button', { name: /Tap to turn on/ });
    expect(screen.queryByText(/Swipe down/)).not.toBeInTheDocument();

    fireEvent.click(banner);

    expect(await screen.findByText(/Swipe down from the top of your screen/)).toBeInTheDocument();
  });

  it('clears by itself when the person comes back with location on', async () => {
    failWith(UNAVAILABLE);
    render(<LocationOffBanner />);
    await screen.findByRole('button', { name: /Tap to turn on/ });

    succeed();
    await act(async () => { window.dispatchEvent(new Event('focus')); });

    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument());
  });

  it('moves up to stay clear of the Offline pill', async () => {
    failWith(UNAVAILABLE);
    setOnline(false);
    render(<LocationOffBanner />);
    const banner = await screen.findByRole('button', { name: /Tap to turn on/ });
    expect(banner.parentElement.className).toContain('7.5rem');
  });
});
