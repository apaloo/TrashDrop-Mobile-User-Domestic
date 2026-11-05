import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import DumpingReportForm from '../DumpingReportForm.js';
import { useAuth } from '../../context/AuthContext.js';
import { dumpingService } from '../../services/dumpingService.js';
import { notificationService } from '../../services/notificationService.js';
import { toastService } from '../../services/toastService.js';

jest.mock('../../services/dumpingService.js');
jest.mock('../../services/notificationService.js');
jest.mock('../../context/AuthContext.js');
jest.mock('../../services/toastService.js', () => ({
  toastService: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
}));
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

  it('shows no pop-up for GPS fixes or photos (the form and camera show them)', async () => {
    jest.useFakeTimers();
    render(<DumpingReportForm />);
    await fix(5.61, -0.21, 60);
    await fix(5.672529, -0.280795, 6);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: /Take Photo with Camera/i }));
    await user.click(screen.getByRole('button', { name: /Mock Capture Photo/i }));
    // Let the capture finish and any pop-up timer run
    act(() => { jest.advanceTimersByTime(1000); });
    act(() => { jest.advanceTimersByTime(1000); });
    jest.useRealTimers();

    expect(await screen.findByText(/1 photo\(s\) captured/)).toBeInTheDocument();
    expect(toastService.success).not.toHaveBeenCalled();
    expect(toastService.warning).not.toHaveBeenCalled();
  });

  it('shows a GPS problem on the form, not as a pop-up', async () => {
    navigator.geolocation.watchPosition = jest.fn((success, error) => {
      error({ code: 1, PERMISSION_DENIED: 1, message: 'denied' });
      return 7;
    });
    render(<DumpingReportForm />);
    expect(await screen.findByText(/location is turned off/i)).toBeInTheDocument();
    expect(screen.queryByText(/approximate/i)).not.toBeInTheDocument();
    expect(toastService.warning).not.toHaveBeenCalled();
  });

  it('says the site is blocked when the browser permission is denied', async () => {
    const saved = navigator.permissions;
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: jest.fn().mockResolvedValue({ state: 'denied' }) },
    });
    navigator.geolocation.watchPosition = jest.fn((success, error) => {
      error({ code: 1, PERMISSION_DENIED: 1, message: 'denied' });
      return 7;
    });
    render(<DumpingReportForm />);
    expect(await screen.findByText(/not allowed to use your location/i)).toBeInTheDocument();
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: saved });
  });

  it('tries again by itself when the user comes back with location on', async () => {
    let calls = 0;
    navigator.geolocation.watchPosition = jest.fn((success, error) => {
      calls += 1;
      if (calls === 1) error({ code: 2, POSITION_UNAVAILABLE: 2, message: 'off' });
      else success({ coords: { latitude: 5.6, longitude: -0.2, accuracy: 8 } });
      return 7;
    });
    render(<DumpingReportForm />);
    expect(await screen.findByText(/location is turned off/i)).toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(await screen.findByText(/Lat: 5\.600000/)).toBeInTheDocument();
    expect(screen.queryByText(/location is turned off/i)).not.toBeInTheDocument();
  });

  it('blocks the form with a turn-on-location prompt when the phone location is off, and a tap asks the phone', async () => {
    navigator.geolocation.watchPosition = jest.fn((success, error) => {
      error({ code: 2, POSITION_UNAVAILABLE: 2, message: 'off' });
      return 7;
    });
    navigator.geolocation.getCurrentPosition = jest.fn((success) => {
      success({ coords: { latitude: 5.61, longitude: -0.21, accuracy: 9 } });
    });
    render(<DumpingReportForm />);

    const dialog = await screen.findByRole('alertdialog', { name: /Turn on location to report/i });
    expect(dialog).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Turn on location$/i }));

    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function), expect.any(Function), expect.objectContaining({ enableHighAccuracy: true })
    );
    expect(await screen.findByText(/Lat: 5\.610000/)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps the prompt up when location is still off, and can go back to the dashboard', async () => {
    const onDone = jest.fn();
    navigator.geolocation.watchPosition = jest.fn((success, error) => {
      error({ code: 1, PERMISSION_DENIED: 1, message: 'off' });
      return 7;
    });
    navigator.geolocation.getCurrentPosition = jest.fn((success, error) => error({ code: 1, PERMISSION_DENIED: 1 }));
    render(<DumpingReportForm onDone={onDone} />);

    await userEvent.click(await screen.findByRole('button', { name: /^Turn on location$/i }));
    // The tap visibly does something, then says it is still off and offers a reload
    expect(screen.getByRole('button', { name: /Checking your location/i })).toBeDisabled();
    expect(await screen.findByText(/still can't get your location/i, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reload page/i })).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Turn on location$/i }));
    expect(await screen.findByText(/tried 2 times/i, {}, { timeout: 3000 })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Back to Dashboard/i }));
    expect(onDone).toHaveBeenCalled();
  });

  it('tells the user location is still blocked after "I have allowed it - try again"', async () => {
    const saved = navigator.permissions;
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: jest.fn().mockResolvedValue({ state: 'denied' }) },
    });
    navigator.geolocation.watchPosition = jest.fn((success, error) => {
      error({ code: 1, PERMISSION_DENIED: 1, message: 'denied' });
      return 7;
    });
    navigator.geolocation.getCurrentPosition = jest.fn((success, error) => error({ code: 1, PERMISSION_DENIED: 1 }));
    render(<DumpingReportForm />);

    expect(await screen.findByRole('alertdialog', { name: /Allow location to report/i })).toBeInTheDocument();
    expect(screen.getAllByText(/App info, then Permissions/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Apps, then Chrome/i).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: /I have allowed it - try again/i }));
    expect(await screen.findByText(/still blocked for TrashDrop/i, {}, { timeout: 3000 })).toBeInTheDocument();
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: saved });
  });

  it('does not block the form for a slow GPS fix', async () => {
    navigator.geolocation.watchPosition = jest.fn((success, error) => {
      error({ code: 3, TIMEOUT: 3, message: 'slow' });
      return 7;
    });
    render(<DumpingReportForm />);
    expect(await screen.findByText(/couldn't find your position yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('stops watching when the form closes', () => {
    const { unmount } = render(<DumpingReportForm />);
    unmount();
    expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(7);
  });
});
