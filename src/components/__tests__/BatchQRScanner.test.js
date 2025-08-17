import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import BatchQRScanner from '../BatchQRScanner.js';
import { batchService } from '../../services/batchService.js';
import { notificationService } from '../../services/notificationService.js';
import { useAuth } from '../../context/AuthContext.js';

// Mock the services
jest.mock('../../services/batchService.js');
jest.mock('../../services/notificationService.js');
jest.mock('../../context/AuthContext.js');
// Mock supabase client to prevent real auth calls
jest.mock('../../utils/supabaseClient.js', () => ({
  __esModule: true,
  default: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  },
}));
jest.mock('react-qr-scanner', () => 
function MockQrScanner({ onScan, onError }) {
  return (
    <div data-testid="mock-qr-reader">
      <button onClick={() => onScan({ text: 'BATCH-123' })}>
        Simulate Scan
      </button>
      <button onClick={() => onError && onError(new Error('permission denied'))}>
        Simulate Error
      </button>
    </div>
  );
}
);

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
    batchService.activateBatchForUserWithRetry = jest.fn().mockResolvedValue({ data: { activated: true }, error: null, attempts: 1 });
    batchService.isBatchLocallyScanned = jest.fn().mockReturnValue(false);
    batchService.enqueueBatchActivation = jest.fn().mockResolvedValue({ data: { queued: true }, error: null });

    notificationService.createNotification.mockResolvedValue({
      data: { id: 'notification1' },
      error: null
    });
  });

  it('renders scanner button when not scanning', async () => {
    await act(async () => {
      render(<BatchQRScanner />);
    });
    expect(screen.getByText('Start Scanning')).toBeInTheDocument();
  });

  it('shows QR scanner when scanning is active', async () => {
    await act(async () => {
      render(<BatchQRScanner />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Start Scanning'));
    });
    expect(screen.getByTestId('mock-qr-reader')).toBeInTheDocument();
    expect(screen.getByText('Stop Scanning')).toBeInTheDocument();
  });

  it('handles successful batch scan', async () => {
    const onScanComplete = jest.fn();
    await act(async () => {
      render(<BatchQRScanner onScanComplete={onScanComplete} />);
    });

    // Start scanning
    await act(async () => {
      fireEvent.click(screen.getByText('Start Scanning'));
    });

    // Simulate QR scan
    await act(async () => {
      fireEvent.click(screen.getByText('Simulate Scan'));
    });

    // Wait for batch details to be displayed
    await waitFor(() => {
      expect(screen.getByText('Batch Details:')).toBeInTheDocument();
      // Labels and values are split; assert both appear
      expect(screen.getByText('Batch ID:')).toBeInTheDocument();
      expect(screen.getByText('BATCH-123')).toBeInTheDocument();
      expect(screen.getByText('Total Bags:')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    // Verify service calls
    expect(batchService.getBatchDetails).toHaveBeenCalledWith('BATCH-123');
    // Activation was attempted with retry wrapper
    expect(batchService.activateBatchForUserWithRetry).toHaveBeenCalled();
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      'user123',
      'batch_scan',
      expect.stringMatching(/Batch (Already Activated|Activated)/),
      expect.any(String),
      { batch_id: 'batch123' }
    );
    expect(onScanComplete).toHaveBeenCalledWith(mockBatchDetails);
  });

  it('handles invalid batch QR code', async () => {
    batchService.getBatchDetails.mockResolvedValueOnce({
      data: null,
      error: null
    });

    await act(async () => {
      render(<BatchQRScanner />);
    });
    
    // Start scanning
    await act(async () => {
      fireEvent.click(screen.getByText('Start Scanning'));
    });

    // Simulate QR scan
    await act(async () => {
      fireEvent.click(screen.getByText('Simulate Scan'));
    });

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText('Invalid batch code. Please check and try again.')).toBeInTheDocument();
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

    await act(async () => {
      render(<BatchQRScanner />);
    });
    
    // Start scanning
    await act(async () => {
      fireEvent.click(screen.getByText('Start Scanning'));
    });

    // Simulate QR scan
    await act(async () => {
      fireEvent.click(screen.getByText('Simulate Scan'));
    });

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText('Service error')).toBeInTheDocument();
    });
  });

  it('shows timeout error on activation failure', async () => {
    // Make retry wrapper simulate a timeout error on first attempt then success
    let call = 0;
    batchService.activateBatchForUserWithRetry.mockImplementation(async (_id, _uid, opts) => {
      call += 1;
      if (opts && typeof opts.onAttempt === 'function') opts.onAttempt(call);
      // Return a timeout error
      return { data: null, error: { message: 'Request timed out' }, attempts: 1, timedOut: true };
    });

    await act(async () => {
      render(<BatchQRScanner />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Start Scanning'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Simulate Scan'));
    });

    await waitFor(() => {
      expect(screen.getByText('Network timeout while activating batch. Please try again.')).toBeInTheDocument();
    });
  });

  it('queues activation when offline', async () => {
    // Simulate offline
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });

    await act(async () => {
      render(<BatchQRScanner />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Start Scanning'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Simulate Scan'));
    });

    await waitFor(() => {
      expect(screen.getByText('Batch Details:')).toBeInTheDocument();
      expect(screen.getByText('queued (offline)')).toBeInTheDocument();
    });

    // Restore online state
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  it('handles camera access error', async () => {
    await act(async () => {
      render(<BatchQRScanner />);
    });
    
    // Start scanning
    await act(async () => {
      fireEvent.click(screen.getByText('Start Scanning'));
    });

    // Simulate camera error via mock button
    await act(async () => {
      fireEvent.click(screen.getByText('Simulate Error'));
    });

    expect(screen.getByText(/Camera permission denied|Failed to access camera/)).toBeInTheDocument();
  });
});
