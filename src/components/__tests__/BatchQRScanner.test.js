import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import BatchQRScanner from '../BatchQRScanner.js';
import { batchService } from '../../services/batchService.js';
import { notificationService } from '../../services/notificationService.js';
import { useAuth } from '../../contexts/AuthContext.js';

// Mock the services
jest.mock('../../services/batchService.js');
jest.mock('../../services/notificationService.js');
jest.mock('../../contexts/AuthContext.js');
jest.mock('react-qr-reader', () => ({
  QrReader: ({ onResult }) => (
    <div data-testid="mock-qr-reader">
      <button onClick={() => onResult({ text: 'BATCH-123' })}>
        Simulate Scan
      </button>
    </div>
  )
}));

describe('BatchQRScanner', () => {
  const mockUser = { id: 'user123' };
  const mockBatchDetails = {
    id: 'batch123',
    batch_qr_code: 'BATCH-123',
    user_id: 'user123',
    status: 'active',
    bags: [{ id: 'bag1' }, { id: 'bag2' }],
    created_at: '2025-07-21T20:00:00Z'
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock useAuth hook
    useAuth.mockReturnValue({ user: mockUser });

    // Mock service responses
    batchService.getBatchDetails.mockResolvedValue({
      data: mockBatchDetails,
      error: null
    });

    notificationService.createNotification.mockResolvedValue({
      data: { id: 'notification1' },
      error: null
    });
  });

  it('renders scanner button when not scanning', () => {
    render(<BatchQRScanner />);
    expect(screen.getByText('Start Scanning')).toBeInTheDocument();
  });

  it('shows QR scanner when scanning is active', () => {
    render(<BatchQRScanner />);
    fireEvent.click(screen.getByText('Start Scanning'));
    expect(screen.getByTestId('mock-qr-reader')).toBeInTheDocument();
    expect(screen.getByText('Stop Scanning')).toBeInTheDocument();
  });

  it('handles successful batch scan', async () => {
    const onScanComplete = jest.fn();
    render(<BatchQRScanner onScanComplete={onScanComplete} />);

    // Start scanning
    fireEvent.click(screen.getByText('Start Scanning'));

    // Simulate QR scan
    fireEvent.click(screen.getByText('Simulate Scan'));

    // Wait for batch details to be displayed
    await waitFor(() => {
      expect(screen.getByText('Batch Details:')).toBeInTheDocument();
      expect(screen.getByText('Batch ID: BATCH-123')).toBeInTheDocument();
      expect(screen.getByText('Total Bags: 2')).toBeInTheDocument();
    });

    // Verify service calls
    expect(batchService.getBatchDetails).toHaveBeenCalledWith('123');
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      'user123',
      'batch_scan',
      'Batch Scanned Successfully',
      'Batch BATCH-123 has been scanned',
      { batch_id: 'batch123' }
    );
    expect(onScanComplete).toHaveBeenCalledWith(mockBatchDetails);
  });

  it('handles invalid batch QR code', async () => {
    batchService.getBatchDetails.mockResolvedValueOnce({
      data: null,
      error: null
    });

    render(<BatchQRScanner />);
    
    // Start scanning
    fireEvent.click(screen.getByText('Start Scanning'));

    // Simulate QR scan
    fireEvent.click(screen.getByText('Simulate Scan'));

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText('Invalid batch QR code')).toBeInTheDocument();
    });
  });

  it('handles batch belonging to different user', async () => {
    const wrongUserBatch = {
      ...mockBatchDetails,
      user_id: 'differentUser'
    };

    batchService.getBatchDetails.mockResolvedValueOnce({
      data: wrongUserBatch,
      error: null
    });

    render(<BatchQRScanner />);
    
    // Start scanning
    fireEvent.click(screen.getByText('Start Scanning'));

    // Simulate QR scan
    fireEvent.click(screen.getByText('Simulate Scan'));

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText('This batch is not assigned to you')).toBeInTheDocument();
    });
  });

  it('handles service error', async () => {
    batchService.getBatchDetails.mockResolvedValueOnce({
      data: null,
      error: { message: 'Service error' }
    });

    render(<BatchQRScanner />);
    
    // Start scanning
    fireEvent.click(screen.getByText('Start Scanning'));

    // Simulate QR scan
    fireEvent.click(screen.getByText('Simulate Scan'));

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText('Service error')).toBeInTheDocument();
    });
  });

  it('handles camera access error', () => {
    render(<BatchQRScanner />);
    
    // Start scanning
    fireEvent.click(screen.getByText('Start Scanning'));

    // Simulate camera error
    const mockQrReader = screen.getByTestId('mock-qr-reader');
    fireEvent.error(mockQrReader);

    expect(screen.getByText('Failed to access camera. Please check permissions.')).toBeInTheDocument();
  });
});
