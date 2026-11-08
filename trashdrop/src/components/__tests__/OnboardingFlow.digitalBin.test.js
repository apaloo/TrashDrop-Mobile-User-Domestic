import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import OnboardingFlow from '../OnboardingFlow.js';
import supabase from '../../utils/supabaseClient.js';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('../../context/AuthContext.js', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../services/batchService.js', () => ({}));
jest.mock('../../utils/supabaseClient.js', () => ({ __esModule: true, default: { rpc: jest.fn(), from: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  try { localStorage.clear(); } catch (e) { /* ignore */ }
});

describe('Onboarding "Request Bin Pickup" step', () => {
  it('opens the Digital Bin request page instead of creating a bin', async () => {
    const onComplete = jest.fn();
    render(<OnboardingFlow onComplete={onComplete} onClose={jest.fn()} initialStep="digital_bin" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Request Bin Pickup' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/digital-bin?source=onboarding'));
    expect(onComplete).toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalledWith('create_digital_bin', expect.anything());
    expect(localStorage.getItem('trashdrop_onboarding_dismissed_user-1')).toBe('true');
  });
});

describe('"Do you have bags?" step', () => {
  const setOnline = (value) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
  afterEach(() => setOnline(true));

  it('says QR Bags on the Yes button', async () => {
    render(<OnboardingFlow onComplete={jest.fn()} onClose={jest.fn()} initialStep="welcome" />);
    expect(await screen.findByRole('button', { name: 'Yes, I have QR Bags' })).toBeInTheDocument();
  });

  it('offline, "No" moves on to choosing a service with no error', async () => {
    setOnline(false);
    render(<OnboardingFlow onComplete={jest.fn()} onClose={jest.fn()} initialStep="welcome" />);

    await userEvent.click(await screen.findByRole('button', { name: "No, I don't have bags" }));

    expect(await screen.findByText('Choose Your Service')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(localStorage.getItem('trashdrop_has_bags_pending_user-1')).toBe('false');
  });

  it('online, "Yes" still goes to adding a location', async () => {
    supabase.rpc.mockResolvedValue({ data: {}, error: null });
    const onComplete = jest.fn();
    render(<OnboardingFlow onComplete={onComplete} onClose={jest.fn()} initialStep="welcome" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Yes, I have QR Bags' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/profile?tab=locations&source=onboarding'));
    expect(onComplete).toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith('set_has_bags', { user_uuid: 'user-1', has_bags: true });
  });
});
