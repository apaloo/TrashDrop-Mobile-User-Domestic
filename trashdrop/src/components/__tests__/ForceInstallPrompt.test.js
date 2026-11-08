import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ForceInstallPrompt from '../ForceInstallPrompt.js';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1';

const offerInstall = (outcome = 'accepted') => {
  const offer = new Event('beforeinstallprompt');
  offer.prompt = jest.fn().mockResolvedValue();
  offer.userChoice = Promise.resolve({ outcome });
  act(() => { window.dispatchEvent(offer); });
  return offer;
};

const useBrowser = (userAgent) => jest.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
const tapInstall = () => act(async () => { fireEvent.click(screen.getByText('Add to Home Screen')); });

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  window.matchMedia = jest.fn(() => ({ matches: false }));
  useBrowser(ANDROID);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Install screen', () => {
  it('opens the install dialog and closes once installed', async () => {
    render(<ForceInstallPrompt />);
    const offer = offerInstall('accepted');

    await tapInstall();

    expect(offer.prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Install TrashDrop')).not.toBeInTheDocument();
    expect(localStorage.getItem('trashdrop_app_installed')).toBe('true');
  });

  it('offers the button before the browser is ready, then waits for it', async () => {
    render(<ForceInstallPrompt />);

    await tapInstall();
    expect(screen.getByText('Getting ready…')).toBeInTheDocument();

    const offer = offerInstall('accepted');
    await act(async () => {});
    expect(offer.prompt).toHaveBeenCalledTimes(1);
  });

  it('stays on the screen when the dialog is declined', async () => {
    render(<ForceInstallPrompt />);
    offerInstall('dismissed');

    await tapInstall();

    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument();
    expect(localStorage.getItem('trashdrop_app_installed')).toBeNull();
  });

  it('shows the steps when the browser cannot install', async () => {
    render(<ForceInstallPrompt />);

    await tapInstall();
    await act(async () => { jest.advanceTimersByTime(3100); });

    expect(screen.getByText('To install:')).toBeInTheDocument();
    expect(screen.queryByText('Works Offline')).not.toBeInTheDocument();
  });

  it('shows the steps straight away on iPhone', () => {
    useBrowser(IPHONE);
    render(<ForceInstallPrompt />);

    expect(screen.getByText('To install:')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('keeps the buttons outside the scrolling area', () => {
    render(<ForceInstallPrompt />);

    const scrollArea = screen.getByTestId('install-scroll');
    expect(scrollArea).toContainElement(screen.getByText('Install TrashDrop'));
    expect(scrollArea).not.toContainElement(screen.getByText('Add to Home Screen'));
    expect(scrollArea).not.toContainElement(screen.getByText('Open App'));
  });

  it('asks again next visit after Open App, even if dismissed in the past', () => {
    localStorage.setItem('trashdrop_install_prompt_seen', 'true');
    const firstVisit = render(<ForceInstallPrompt />);

    fireEvent.click(screen.getByText('Open App'));
    expect(screen.queryByText('Add to Home Screen')).not.toBeInTheDocument();
    firstVisit.unmount();

    render(<ForceInstallPrompt />);
    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument();
  });

  it('stays away once installed or running as the app', () => {
    localStorage.setItem('trashdrop_app_installed', 'true');
    const installed = render(<ForceInstallPrompt />);
    expect(screen.queryByText('Install TrashDrop')).not.toBeInTheDocument();
    installed.unmount();

    localStorage.clear();
    window.matchMedia = jest.fn(() => ({ matches: true }));
    render(<ForceInstallPrompt />);
    expect(screen.queryByText('Install TrashDrop')).not.toBeInTheDocument();
  });
});
