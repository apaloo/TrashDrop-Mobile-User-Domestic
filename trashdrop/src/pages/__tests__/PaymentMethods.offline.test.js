import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import PaymentMethods from '../PaymentMethods.js';
import { paymentService } from '../../services/paymentService.js';

jest.mock('../../context/AuthContext.js', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../../components/PaymentMethodForm.js', () => () => null);
jest.mock('../../services/paymentService.js', () => ({ paymentService: { getUserPaymentMethods: jest.fn() } }));

const mount = () => render(<MemoryRouter><PaymentMethods /></MemoryRouter>);

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  paymentService.getUserPaymentMethods.mockReset();
});

afterEach(() => jest.restoreAllMocks());

describe('Payment Methods with no connection', () => {
  it('waits calmly: no error, and does not claim there are none', async () => {
    paymentService.getUserPaymentMethods.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    mount();

    expect(await screen.findByText("Your payment methods will appear when you're back online.")).toBeInTheDocument();
    expect(screen.queryByText('Failed to load payment methods')).not.toBeInTheDocument();
    expect(screen.queryByText('No payment methods')).not.toBeInTheDocument();
  });

  it('loads by itself when the connection is back', async () => {
    paymentService.getUserPaymentMethods.mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    mount();
    await screen.findByText("Your payment methods will appear when you're back online.");

    paymentService.getUserPaymentMethods.mockResolvedValue({ data: [], error: null });
    await act(async () => { window.dispatchEvent(new Event('online')); });

    expect(await screen.findByText('No payment methods')).toBeInTheDocument();
  });

  it('a real server failure still says so', async () => {
    paymentService.getUserPaymentMethods.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    mount();
    expect(await screen.findByText('Failed to load payment methods')).toBeInTheDocument();
  });
});
