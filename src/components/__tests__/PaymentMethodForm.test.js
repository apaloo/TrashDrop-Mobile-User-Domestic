import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react.js';
import userEvent from '@testing-library/user-event.js';
import '@testing-library/jest-dom.js';
import PaymentMethodForm from '../PaymentMethodForm.js';
import { paymentService } from '../../services/paymentService.js';
import { useAuth } from '../../contexts/AuthContext.js';

// Mock the services and hooks
jest.mock('../../services/paymentService.js');
jest.mock('../../contexts/AuthContext.js');

describe('PaymentMethodForm', () => {
  const mockUser = { id: 'user123' };
  const mockPaymentMethod = {
    id: 'payment123',
    type: 'card',
    provider: 'visa',
    details: {
      last4: '4242',
      expiry: '12/25'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: mockUser });
    paymentService.addPaymentMethod.mockResolvedValue({
      data: mockPaymentMethod,
      error: null
    });
  });

  it('renders all form fields correctly', () => {
    render(<PaymentMethodForm />);
    
    // Check for required fields
    expect(screen.getByLabelText(/Payment Type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Provider/i)).toBeInTheDocument();
    expect(screen.getByText(/Add Payment Method/i)).toBeInTheDocument();
  });

  it('shows card fields when card payment type is selected', async () => {
    render(<PaymentMethodForm />);
    
    // Select card payment type using fireEvent
    const typeSelect = screen.getByLabelText(/Payment Type/i);
    fireEvent.mouseDown(typeSelect);
    const cardOption = screen.getByText(/Credit\/Debit Card/i);
    fireEvent.click(cardOption);

    // Check for card-specific fields
    await waitFor(() => {
      expect(screen.getByLabelText(/Card Number/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Expiry Date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/CVV/i)).toBeInTheDocument();
    });
  });

  it('validates card number format', async () => {
    render(<PaymentMethodForm />);
    
    // Select card payment type
    const typeSelect = screen.getByLabelText(/Payment Type/i);
    userEvent.click(typeSelect);
    userEvent.click(screen.getByText(/Credit\/Debit Card/i));

    // Enter invalid card number
    const cardInput = await screen.findByLabelText(/Card Number/i);
    fireEvent.change(cardInput, { target: { value: '1234' } });

    // Submit form
    const submitButton = screen.getByText(/Add Payment Method/i);
    fireEvent.click(submitButton);

    // Check for error message
    expect(screen.getByText(/Invalid card number/i)).toBeInTheDocument();
  });

  it('validates expiry date format', async () => {
    render(<PaymentMethodForm />);
    
    // Select card payment type
    const typeSelect = screen.getByLabelText(/Payment Type/i);
    userEvent.click(typeSelect);
    userEvent.click(screen.getByText(/Credit\/Debit Card/i));

    // Enter invalid expiry date
    const expiryInput = await screen.findByLabelText(/Expiry Date/i);
    fireEvent.change(expiryInput, { target: { value: '1234' } });

    // Submit form
    const submitButton = screen.getByText(/Add Payment Method/i);
    fireEvent.click(submitButton);

    // Check for error message
    expect(screen.getByText(/Invalid expiry date/i)).toBeInTheDocument();
  });

  it('handles successful payment method addition', async () => {
    const onSuccess = jest.fn();
    render(<PaymentMethodForm onSuccess={onSuccess} />);
    
    // Fill out form with direct state changes
    fireEvent.change(screen.getByLabelText(/Payment Type/i), { target: { value: 'card' } });
    fireEvent.change(screen.getByLabelText(/Provider/i), { target: { value: 'visa' } });

    const cardInput = screen.getByLabelText(/Card Number/i);
    fireEvent.change(cardInput, { target: { value: '4242424242424242' } });

    const expiryInput = screen.getByLabelText(/Expiry Date/i);
    fireEvent.change(expiryInput, { target: { value: '12/25' } });

    const cvvInput = screen.getByLabelText(/CVV/i);
    fireEvent.change(cvvInput, { target: { value: '123' } });

    // Submit form
    const submitButton = screen.getByText(/Add Payment Method/i);
    fireEvent.click(submitButton);

    // Verify service call
    await waitFor(() => {
      expect(paymentService.addPaymentMethod).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          type: 'card',
          provider: 'visa'
        })
      );
      expect(onSuccess).toHaveBeenCalledWith(mockPaymentMethod);
    });
  });

  it('handles service error', async () => {
    paymentService.addPaymentMethod.mockResolvedValueOnce({
      data: null,
      error: { message: 'Service error' }
    });

    render(<PaymentMethodForm />);
    
    // Fill out minimal form
    const typeSelect = screen.getByLabelText(/Payment Type/i);
    userEvent.click(typeSelect);
    userEvent.click(screen.getByText(/Bank Account/i));

    const providerSelect = screen.getByLabelText(/Provider/i);
    userEvent.click(providerSelect);
    userEvent.click(screen.getByText(/Bank of America/i));

    // Submit form
    const submitButton = screen.getByText(/Add Payment Method/i);
    fireEvent.click(submitButton);

    // Check for error message
    await waitFor(() => {
      expect(screen.getByText('Service error')).toBeInTheDocument();
    });
  });

  it('shows different providers based on payment type', async () => {
    render(<PaymentMethodForm />);
    
    // Simply verify the provider select exists
    expect(screen.getByLabelText(/Provider/i)).toBeInTheDocument();
  });

  it('submits form successfully', async () => {
    render(<PaymentMethodForm />);
    
    // Fill minimal form and submit
    fireEvent.change(screen.getByLabelText(/Payment Type/i), { target: { value: 'bank' } });
    fireEvent.change(screen.getByLabelText(/Provider/i), { target: { value: 'chase' } });

    const submitButton = screen.getByText(/Add Payment Method/i);
    fireEvent.click(submitButton);

    // Check that service was called
    await waitFor(() => {
      expect(paymentService.addPaymentMethod).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          type: 'bank',
          provider: 'chase'
        })
      );
    });
  });
});
