import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import DumpingReportForm from '../DumpingReportForm.js';
import { useAuth } from '../../context/AuthContext.js';
import { dumpingService } from '../../services/dumpingService.js';
import { notificationService } from '../../services/notificationService.js';

// Mock the services and hooks
jest.mock('../../services/dumpingService.js');
jest.mock('../../services/notificationService.js');
jest.mock('../../context/AuthContext.js');

// Mock CameraModal to simulate photo capture easily
jest.mock('../CameraModal.js', () => ({ onCapture, onClose }) => (
  <div>
    <button onClick={() => onCapture({ id: 'photo1', url: 'blob://photo-1' })}>
      Mock Capture Photo
    </button>
    <button onClick={onClose}>Close Camera</button>
  </div>
));

describe('DumpingReportForm', () => {
  const mockUser = { id: 'user123' };
  const mockLocation = {
    latitude: 37.7749,
    longitude: -122.4194
  };
  const mockReport = {
    id: 'report123',
    location: '123 Test St',
    coordinates: mockLocation,
    description: 'Test dumping',
    waste_type: 'mixed',
    severity: 'medium',
    estimated_volume: '2 truck loads',
    hazardous_materials: false,
    accessibility_notes: 'Easy access',
    cleanup_priority: 'normal',
    photos: []
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: mockUser });

    // Mock geolocation
    const mockGeolocation = {
      getCurrentPosition: jest.fn().mockImplementation((success) =>
        success({
          coords: mockLocation
        })
      )
    };
    global.navigator.geolocation = mockGeolocation;

    // Mock service responses
    dumpingService.createReport.mockResolvedValue({
      data: mockReport,
      error: null
    });
    notificationService.createNotification.mockResolvedValue({
      data: { id: 'notification1' },
      error: null
    });

    // Mock URL.createObjectURL
    global.URL.createObjectURL = jest.fn(() => 'mock-url');
  });

  it('renders key form sections and controls', () => {
    render(<DumpingReportForm />);

    expect(screen.getByText(/Report Illegal Dumping/i)).toBeInTheDocument();
    expect(screen.getByText(/Type of Waste/i)).toBeInTheDocument();
    expect(screen.getByText(/Severity/i)).toBeInTheDocument();
    expect(screen.getByText(/Size of the illegal dumping/i)).toBeInTheDocument();
    expect(screen.getByText(/Take Photos/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Use My Location/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Take Photo with Camera/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Report/i })).toBeInTheDocument();
  });

  it('gets user location on mount', async () => {
    render(<DumpingReportForm />);

    await waitFor(() => {
      expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalled();
    });
  });

  it('handles successful form submission', async () => {
    const onSuccess = jest.fn();
    render(<DumpingReportForm onSuccess={onSuccess} />);

    // Select waste type
    const wasteTypeSelect = screen.getAllByRole('combobox')[0];
    await userEvent.selectOptions(wasteTypeSelect, 'mixed');

    // Select severity via button
    await userEvent.click(screen.getByRole('button', { name: /Medium/i }));

    // Select size (estimated_volume)
    const sizeSelect = screen.getAllByRole('combobox')[1] || screen.getByText(/Size of the illegal dumping/i).closest('div').querySelector('select');
    await userEvent.selectOptions(sizeSelect, 'medium');

    // Open camera and capture a photo via mocked modal
    await userEvent.click(screen.getByRole('button', { name: /Take Photo with Camera/i }));
    await userEvent.click(screen.getByRole('button', { name: /Mock Capture Photo/i }));

    // Submit form (wait for button to be enabled after photo processing)
    const submitBtn1 = screen.getByRole('button', { name: /Submit/i });
    await waitFor(() => expect(submitBtn1).not.toBeDisabled());
    await userEvent.click(submitBtn1);

    await waitFor(() => {
      expect(dumpingService.createReport).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          coordinates: expect.objectContaining({ latitude: expect.any(Number), longitude: expect.any(Number) }),
          waste_type: 'mixed',
          severity: 'medium',
          estimated_volume: 'medium',
          photos: expect.arrayContaining(['blob://photo-1'])
        })
      );

      expect(notificationService.createNotification).toHaveBeenCalledWith(
        'authorities',
        'dumping_report',
        'New Illegal Dumping Report',
        expect.any(String),
        expect.objectContaining({
          report_id: 'report123',
          severity: 'medium',
          coordinates: expect.any(Object)
        })
      );

      expect(onSuccess).toHaveBeenCalledWith(mockReport);
    });
  });

  it('captures photo via camera modal (mocked)', async () => {
    render(<DumpingReportForm />);

    // Open camera
    await userEvent.click(screen.getByRole('button', { name: /Take Photo with Camera/i }));

    // Capture photo using mocked modal
    await userEvent.click(screen.getByRole('button', { name: /Mock Capture Photo/i }));

    // UI shows captured photos count text
    await waitFor(() => {
      expect(screen.getByText(/photo\(s\) captured/i)).toBeInTheDocument();
    });
  });

  it('falls back to default coordinates when geolocation fails', async () => {
    // Mock geolocation error
    const mockGeolocationError = {
      getCurrentPosition: jest.fn().mockImplementation((success, error) =>
        error({ code: 1, message: 'Geolocation error' })
      )
    };
    global.navigator.geolocation = mockGeolocationError;

    render(<DumpingReportForm />);

    // Expect default Accra coordinates to be displayed (fallback)
    await waitFor(() => {
      expect(screen.getByText(/Lat:\s*5\.614736/i)).toBeInTheDocument();
      expect(screen.getByText(/Lng:\s*-0\.208811/i)).toBeInTheDocument();
    });
  });

  it('handles service error', async () => {
    dumpingService.createReport.mockResolvedValueOnce({
      data: null,
      error: { message: 'Service error' }
    });

    render(<DumpingReportForm />);

    // Fill minimum required fields: waste type, size, and at least one photo
    const wasteTypeSelect = screen.getAllByRole('combobox')[0];
    await userEvent.selectOptions(wasteTypeSelect, 'mixed');
    const sizeSelect = screen.getAllByRole('combobox')[1] || screen.getByText(/Size of the illegal dumping/i).closest('div').querySelector('select');
    await userEvent.selectOptions(sizeSelect, 'small');
    await userEvent.click(screen.getByRole('button', { name: /Take Photo with Camera/i }));
    await userEvent.click(screen.getByRole('button', { name: /Mock Capture Photo/i }));

    const submitBtn2 = screen.getByRole('button', { name: /Submit/i });
    await waitFor(() => expect(submitBtn2).not.toBeDisabled());
    await userEvent.click(submitBtn2);

    await waitFor(() => {
      expect(screen.getByText('Service error')).toBeInTheDocument();
    });
  });

  it('shows and toggles contact consent checkbox', async () => {
    render(<DumpingReportForm />);

    const checkbox = screen.getByRole('checkbox', { name: /willing to be contacted/i });
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });



  it('clears form after successful submission', async () => {
    render(<DumpingReportForm />);

    // Fill minimum required fields and capture a photo
    const wasteTypeSelect = screen.getAllByRole('combobox')[0];
    await userEvent.selectOptions(wasteTypeSelect, 'mixed');
    const sizeSelect = screen.getAllByRole('combobox')[1] || screen.getByText(/Size of the illegal dumping/i).closest('div').querySelector('select');
    await userEvent.selectOptions(sizeSelect, 'small');
    await userEvent.click(screen.getByRole('button', { name: /Take Photo with Camera/i }));
    await userEvent.click(screen.getByRole('button', { name: /Mock Capture Photo/i }));

    const submitBtn3 = screen.getByRole('button', { name: /Submit/i });
    await waitFor(() => expect(submitBtn3).not.toBeDisabled());
    await userEvent.click(submitBtn3);

    await waitFor(() => {
      expect(dumpingService.createReport).toHaveBeenCalled();
    });

    // Check that form resets: selects cleared and submit disabled
    const selects = screen.getAllByRole('combobox');
    expect(selects[0]).toHaveValue('');
    expect(selects[1]).toHaveValue('');

    // Submit button disabled after reset (no photos, no required fields)
    expect(screen.getByRole('button', { name: /Submit/i })).toBeDisabled();
  });
});
