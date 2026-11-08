import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import NetworkStatusRibbon from '../NetworkStatusRibbon.js';

const setOnline = (value) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });

afterEach(() => {
  setOnline(true);
  jest.useRealTimers();
});

describe('The one offline notice', () => {
  it('shows nothing while online', () => {
    render(<NetworkStatusRibbon />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a small "Offline" pill, never an error, and does not move the page', () => {
    setOnline(false);
    render(<NetworkStatusRibbon />);

    expect(screen.getByRole('status')).toHaveTextContent('Offline · showing saved info');
    expect(screen.getByRole('status')).not.toHaveTextContent(/error|limited/i);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(document.body.style.paddingTop).toBe('');
  });

  it('says "Back online" briefly, then disappears', () => {
    jest.useFakeTimers();
    setOnline(false);
    render(<NetworkStatusRibbon />);

    setOnline(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(screen.getByRole('status')).toHaveTextContent('Back online');

    act(() => { jest.advanceTimersByTime(2100); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('appears when the connection drops', () => {
    render(<NetworkStatusRibbon />);
    setOnline(false);
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(screen.getByRole('status')).toHaveTextContent('Offline');
  });
});
