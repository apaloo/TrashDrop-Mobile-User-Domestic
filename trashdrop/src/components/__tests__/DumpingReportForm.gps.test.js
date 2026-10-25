import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import DumpingReportForm from '../DumpingReportForm.js';
import { useAuth } from '../../context/AuthContext.js';
import { dumpingService } from '../../services/dumpingService.js';
import { notificationService } from '../../services/notificationService.js';

jest.mock('../../services/dumpingService.js');
jest.mock('../../services/notificationService.js');
jest.mock('../../context/AuthContext.js');
jest.mock('../CameraModal.js', () => ({ onCapture }) => (
  <button onClick={() => onCapture({ id: 'photo1', url: 'blob://photo-1' })}>Mock Capture Photo</button>
));

// GPS keeps running while the user fills in the form and takes photos, keeps
// the most accurate fix, and stops when the report is submitted.
describe('DumpingReportForm GPS', () => {
  let emit;

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 'user123' } });
    global.navigator.geolocation = {
      watchPosition: jest.fn((success) => { emit = success; return 7; }),
      clearWatch: jest.fn(),
    };
    global.URL.createObjectURL = jest.fn(() => 'mock-url');
    dumpingService.createReport.mockResolvedValue({ data: { id: 'report123' }, error: null });
    notificationService.createNotification.mockResolvedValue({ data: {}, error: null });
  });

  const fix = (latitude, longitude, accuracy) => act(() => emit({ coords: { latitude, longitude, accuracy } }));

  it('keeps the most accurate fix, through the camera, and submits it', async () => {
    render(<DumpingReportForm />);

    await fix(5.61, -0.21, 60); // first, coarse fix
    expect(await screen.findByText(/GPS ±60 m/)).toBeInTheDocument();

    await userEvent.click(screen.getByText('Mixed'));
    await userEvent.click(screen.getByText('Few bags'));
    // The user leaves for the camera before GPS has settled
    await userEvent.click(screen.getByRole('button', { name: /Take Photo with Camera/i }));
    await fix(5.672529, -0.280795, 6); // GPS settles while the camera is open
    await userEvent.click(screen.getByRole('button', { name: /Mock Capture Photo/i }));
    await fix(5.7, -0.3, 25); // a worse fix later is ignored

    expect(navigator.geolocation.clearWatch).not.toHaveBeenCalled();
    expect(screen.getByText(/Lat: 5\.672529/)).toBeInTheDocument();
    expect(screen.getByText(/GPS ±6 m · improving until you submit/)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: /Submit Report/i })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: /Submit Report/i }));

    await waitFor(() => expect(dumpingService.createReport).toHaveBeenCalled());
    expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(7);
    expect(dumpingService.createReport).toHaveBeenCalledWith('user123', expect.objectContaining({
      coordinates: { latitude: 5.672529, longitude: -0.280795 },
    }));
  });

  it('stops watching when the form closes', () => {
    const { unmount } = render(<DumpingReportForm />);
    unmount();
    expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(7);
  });
});
