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
