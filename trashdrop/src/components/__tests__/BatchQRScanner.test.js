import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import BatchQRScanner from '../BatchQRScanner.js';
import { batchService } from '../../services/batchService.js';
import { notificationService } from '../../services/notificationService.js';
import { useAuth } from '../../context/AuthContext.js';
import realTableInspector from '../../utils/realTableInspector.js';

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
// Only runs when a batch isn't found
jest.mock('../../utils/realTableInspector.js', () => ({
  __esModule: true,
  default: { runFullDiagnosis: jest.fn() },
}));

// The scanner's camera view (QRReader wraps qr-scanner, which needs a real camera)
jest.mock('../QRReader', () => 
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
  const activated = {
    batch_id: 'BATCH-123', status: 'used', activated: true, bags_added: 2, bag_count: 2,
    created_at: '2026-07-21T20:00:00Z',
  };
  let bagEvents;
  const onBags = (e) => bagEvents.push(e.detail);

  const startAndScan = async (props = {}) => {
    render(<BatchQRScanner {...props} />);
    await act(async () => { fireEvent.click(screen.getByText('Start Scanning')); });
    await act(async () => { fireEvent.click(screen.getByText('Simulate Scan')); });
  };

  beforeEach(() => {
    useAuth.mockReturnValue({ user: { id: 'user123' } });
    batchService.verifyBatchAndUpdateUser = jest.fn().mockResolvedValue({ data: activated, error: null });
    realTableInspector.runFullDiagnosis.mockResolvedValue({ recommendations: [] });
    bagEvents = [];
    window.addEventListener('trashdrop:bags-updated', onBags);
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  afterEach(() => {
    window.removeEventListener('trashdrop:bags-updated', onBags);
  });

  it('renders the Start Scanning button when not scanning', () => {
    render(<BatchQRScanner />);
    expect(screen.getByText('Start Scanning')).toBeInTheDocument();
  });

  it('shows the camera and a Stop button while scanning', async () => {
    render(<BatchQRScanner />);
    await act(async () => { fireEvent.click(screen.getByText('Start Scanning')); });
    expect(screen.getByTestId('mock-qr-reader')).toBeInTheDocument();
    expect(screen.getByText('Stop Scanning')).toBeInTheDocument();
  });

  it('a fresh batch: shows the result, reports it and adds its bags', async () => {
    const onScanComplete = jest.fn();
    await startAndScan({ onScanComplete });

    const result = await screen.findByRole('region', { name: 'Batch scanned' });
    expect(result).toHaveTextContent('Batch Scanned Successfully!');
    expect(result).toHaveTextContent('BATCH-123');
    expect(result).toHaveTextContent('Total bags2');
    expect(batchService.verifyBatchAndUpdateUser).toHaveBeenCalledWith('BATCH-123', 'user123', expect.any(Object));
    expect(onScanComplete).toHaveBeenCalledWith(activated);
    // The dashboard and pickup form update their bag counts from this event
    expect(bagEvents).toEqual([{ userId: 'user123', deltaBags: 2, source: 'batch-scan' }]);
  });

  it('an already-activated batch is shown as such and adds no bags', async () => {
    batchService.verifyBatchAndUpdateUser.mockResolvedValueOnce({ data: { ...activated, alreadyActivated: true }, error: null });
    await startAndScan();

    const result = await screen.findByRole('region', { name: 'Batch already scanned' });
    expect(result).toHaveTextContent('This batch was previously scanned and activated.');
    expect(bagEvents).toEqual([]);
  });

  it('a duplicate scan is refused', async () => {
    batchService.verifyBatchAndUpdateUser.mockResolvedValueOnce({ data: null, error: { code: 'BATCH_DUPLICATE', message: 'dup' } });
    await startAndScan();
    expect(await screen.findByRole('alert')).toHaveTextContent('Batch already scanned');
    expect(bagEvents).toEqual([]);
  });

  it('a batch that is not found says so', async () => {
    batchService.verifyBatchAndUpdateUser.mockResolvedValueOnce({ data: null, error: { message: 'Batch not found' } });
    await startAndScan();
    expect(await screen.findByRole('alert')).toHaveTextContent('Batch UUID not found in Supabase batches table: BATCH-123');
    expect(realTableInspector.runFullDiagnosis).toHaveBeenCalledWith('user123', 'BATCH-123');
  });

  it('shows a service error', async () => {
    batchService.verifyBatchAndUpdateUser.mockResolvedValueOnce({ data: null, error: { message: 'Service error' } });
    await startAndScan();
    expect(await screen.findByRole('alert')).toHaveTextContent('Service error');
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('needs an internet connection to verify a batch', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await startAndScan();
    expect(await screen.findByRole('alert')).toHaveTextContent('Internet connection required for batch verification');
    expect(batchService.verifyBatchAndUpdateUser).not.toHaveBeenCalled();
  });

  it('asks to sign in again without a user', async () => {
    useAuth.mockReturnValue({ user: null });
    await startAndScan();
    expect(await screen.findByRole('alert')).toHaveTextContent('Missing user context. Please sign in again.');
  });

  it('shows camera errors', async () => {
    render(<BatchQRScanner />);
    await act(async () => { fireEvent.click(screen.getByText('Start Scanning')); });
    await act(async () => { fireEvent.click(screen.getByText('Simulate Error')); });
    expect(screen.getByRole('alert')).toHaveTextContent('permission denied');
  });
});
