import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import DumpingReportForm from '../DumpingReportForm.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { dumpingService } from '../../services/dumpingService.js';
import { notificationService } from '../../services/notificationService.js';

// Mock the services and hooks
jest.mock('../../services/dumpingService.js');
jest.mock('../../services/notificationService.js');
jest.mock('../../contexts/AuthContext.js');

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

  it('renders form fields correctly', () => {
    render(<DumpingReportForm />);
    
    expect(screen.getByLabelText(/Location Description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Dumping Description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Waste Type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Severity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Estimated Volume/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Cleanup Priority/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Accessibility Notes/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Contains Hazardous Materials/i)).toBeInTheDocument();
    expect(screen.getByText(/Add Photos/i)).toBeInTheDocument();
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

    // Fill out form
    fireEvent.change(screen.getByLabelText(/Location Description/i), {
      target: { value: '123 Test St' }
    });
    fireEvent.change(screen.getByLabelText(/Dumping Description/i), {
      target: { value: 'Test dumping' }
    });

    // Select waste type
    const wasteTypeSelect = screen.getByLabelText(/Waste Type/i);
    userEvent.click(wasteTypeSelect);
    userEvent.click(screen.getByText(/Mixed Waste/i));

    // Select severity
    const severitySelect = screen.getByLabelText(/Severity/i);
    userEvent.click(severitySelect);
    userEvent.click(screen.getByText(/Medium/i));

    fireEvent.change(screen.getByLabelText(/Estimated Volume/i), {
      target: { value: '2 truck loads' }
    });

    // Select cleanup priority
    const prioritySelect = screen.getByLabelText(/Cleanup Priority/i);
    userEvent.click(prioritySelect);
    userEvent.click(screen.getByText(/Normal/i));

    fireEvent.change(screen.getByLabelText(/Accessibility Notes/i), {
      target: { value: 'Easy access' }
    });

    // Submit form
    fireEvent.click(screen.getByText(/Submit Report/i));

    await waitFor(() => {
      expect(dumpingService.createReport).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          location: '123 Test St',
          coordinates: mockLocation,
          description: 'Test dumping',
          waste_type: 'mixed',
          severity: 'medium',
          estimated_volume: '2 truck loads',
          hazardous_materials: false,
          accessibility_notes: 'Easy access',
          cleanup_priority: 'normal'
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
          coordinates: mockLocation
        })
      );

      expect(onSuccess).toHaveBeenCalledWith(mockReport);
    });
  });

  it('handles photo upload', async () => {
    render(<DumpingReportForm />);

    const file = new File(['test'], 'test.png', { type: 'image/png' });
    const input = screen.getByLabelText(/Add Photos/i);

    Object.defineProperty(input, 'files', {
      value: [file]
    });

    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText('1 photos selected')).toBeInTheDocument();
      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    });
  });

  it('requires location services', async () => {
    // Mock geolocation error
    const mockGeolocationError = {
      getCurrentPosition: jest.fn().mockImplementation((success, error) =>
        error({ message: 'Geolocation error' })
      )
    };
    global.navigator.geolocation = mockGeolocationError;

    render(<DumpingReportForm />);

    fireEvent.change(screen.getByLabelText(/Location Description/i), {
      target: { value: '123 Test St' }
    });

    fireEvent.click(screen.getByText(/Submit Report/i));

    await waitFor(() => {
      expect(screen.getByText('Location is required. Please enable location services.')).toBeInTheDocument();
    });
  });

  it('handles service error', async () => {
    dumpingService.createReport.mockResolvedValueOnce({
      data: null,
      error: { message: 'Service error' }
    });

    render(<DumpingReportForm />);

    // Fill minimum required fields
    fireEvent.change(screen.getByLabelText(/Location Description/i), {
      target: { value: '123 Test St' }
    });
    fireEvent.change(screen.getByLabelText(/Dumping Description/i), {
      target: { value: 'Test dumping' }
    });

    fireEvent.click(screen.getByText(/Submit Report/i));

    await waitFor(() => {
      expect(screen.getByText('Service error')).toBeInTheDocument();
    });
  });

  it('toggles hazardous materials flag', () => {
    render(<DumpingReportForm />);

    const checkbox = screen.getByLabelText(/Contains Hazardous Materials/i);
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });



  it('clears form after successful submission', async () => {
    render(<DumpingReportForm />);

    // Fill out form
    fireEvent.change(screen.getByLabelText(/Location Description/i), {
      target: { value: '123 Test St' }
    });
    fireEvent.change(screen.getByLabelText(/Dumping Description/i), {
      target: { value: 'Test dumping' }
    });

    // Submit form
    fireEvent.click(screen.getByText(/Submit Report/i));

    await waitFor(() => {
      expect(dumpingService.createReport).toHaveBeenCalled();
    });

    // Check that form inputs are cleared
    expect(screen.getByLabelText(/Location Description/i)).toHaveValue('');
    expect(screen.getByLabelText(/Dumping Description/i)).toHaveValue('');
    expect(screen.getByLabelText(/Contains Hazardous Materials/i)).not.toBeChecked();
  });
});
