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

// The form uses tappable cards, not dropdowns. Cards are picked by their own
// text; "Medium" is both a severity and a size, so sizes go by their subtitle.
const pickWasteType = (label) => userEvent.click(screen.getByText(label));
const pickSize = (subtitle) => userEvent.click(screen.getByText(subtitle));
const takePhoto = async () => {
  await userEvent.click(screen.getByRole('button', { name: /Take Photo with Camera/i }));
  await userEvent.click(screen.getByRole('button', { name: /Mock Capture Photo/i }));
};
// The button reads "Submitting..." while a photo is processed, then "Submit Report"
const submitWhenReady = async () => {
  await waitFor(() => expect(screen.getByRole('button', { name: /Submit Report/i })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: /Submit Report/i }));
};

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

    expect(screen.getByRole('heading', { name: /Report Illegal Dumping/i })).toBeInTheDocument();
    expect(screen.getByText(/^Type of Waste/)).toBeInTheDocument();
    expect(screen.getByText(/^Severity/)).toBeInTheDocument();
    expect(screen.getByText(/^Size of the illegal dumping/)).toBeInTheDocument();
    expect(screen.getByText(/^Take Photos/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Use My Location/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Take Photo with Camera/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Report/i })).toBeDisabled();
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

    await pickWasteType('Mixed');
    // Severity starts on Medium; pick High to show the choice is sent
    await userEvent.click(screen.getByText('High'));
    await pickSize('Car load');
    await takePhoto();
    await submitWhenReady();

    await waitFor(() => {
      expect(dumpingService.createReport).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          coordinates: expect.objectContaining({ latitude: expect.any(Number), longitude: expect.any(Number) }),
          waste_type: 'mixed',
          severity: 'high',
          estimated_volume: 'medium',
          photos: expect.arrayContaining(['blob://photo-1'])
        })
      );
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(mockReport));
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      'authorities',
      'dumping_report',
      'New Illegal Dumping Report',
      expect.any(String),
      expect.objectContaining({
        report_id: 'report123',
        severity: 'high',
        coordinates: expect.any(Object)
      })
    );
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

  it('asks for a location when GPS fails (no default coordinates)', async () => {
    global.navigator.geolocation = {
      getCurrentPosition: jest.fn().mockImplementation((success, error) =>
        error({ code: 1, PERMISSION_DENIED: 1, message: 'Geolocation error' })
      )
    };

    render(<DumpingReportForm />);

    expect(await screen.findByText(/No location set yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Location access denied/i)).toBeInTheDocument();
    expect(screen.getByText(/A location - tap the map/i)).toBeInTheDocument();
    expect(screen.queryByText(/Lat:/)).not.toBeInTheDocument();
  });

  it('handles service error', async () => {
    dumpingService.createReport.mockResolvedValueOnce({
      data: null,
      error: { message: 'Service error' }
    });

    render(<DumpingReportForm />);

    await pickWasteType('Mixed');
    await pickSize('Few bags');
    await takePhoto();
    await submitWhenReady();

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

    await pickWasteType('Mixed');
    await pickSize('Few bags');
    await takePhoto();
    await submitWhenReady();

    await waitFor(() => {
      expect(dumpingService.createReport).toHaveBeenCalled();
    });

    // Confirmation shows, and the form is empty again
    expect(await screen.findByText(/Report submitted - reference REPORT12/i)).toBeInTheDocument();
    expect(screen.queryByText(/photo\(s\) captured/i)).not.toBeInTheDocument();
    expect(screen.getByText('The type of waste')).toBeInTheDocument();
    expect(screen.getByText('The size of the illegal dumping')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Report/i })).toBeDisabled();
  });
});
