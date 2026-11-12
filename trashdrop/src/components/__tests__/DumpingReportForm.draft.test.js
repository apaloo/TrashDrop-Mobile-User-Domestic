import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import DumpingReportForm from '../DumpingReportForm.js';
import { useAuth } from '../../context/AuthContext.js';
import { dumpingService } from '../../services/dumpingService.js';
import { loadReportDraft, saveReportDraft, clearReportDraft } from '../../utils/reportDraft.js';

// TD44: an unsent report survives the sign-in ending, and the resident is
// told to sign in again instead of "check your connection".
jest.mock('../../services/dumpingService.js');
jest.mock('../../services/notificationService.js');
jest.mock('../../context/AuthContext.js');
jest.mock('../../utils/reportDraft.js', () => ({
  loadReportDraft: jest.fn(),
  saveReportDraft: jest.fn(),
  clearReportDraft: jest.fn(),
  hasDraftContent: jest.requireActual('../../utils/reportDraft.js').hasDraftContent,
}));
jest.mock('../CameraModal.js', () => () => null);

const draft = {
  savedAt: 1,
  form: { waste_type: 'mixed', estimated_volume: 'small', severity: 'high', coordinates: { latitude: 5.6726, longitude: -0.2809 } },
  photos: [{ id: 'p1', blob: { size: 3 } }, { id: 'p2', blob: { size: 4 } }],
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: 'user123' } });
  global.navigator.geolocation = { watchPosition: jest.fn(() => 1), clearWatch: jest.fn() };
  global.URL.createObjectURL = jest.fn((b) => `blob:restored-${b.size}`);
  loadReportDraft.mockResolvedValue(null);
  saveReportDraft.mockResolvedValue(true);
  clearReportDraft.mockResolvedValue(undefined);
});

describe('DumpingReportForm draft', () => {
  it('puts back an unsent report with its photos and location', async () => {
    loadReportDraft.mockResolvedValue(draft);
    render(<DumpingReportForm />);

    expect(await screen.findByText(/Your unsent report is back/)).toBeInTheDocument();
    expect(loadReportDraft).toHaveBeenCalledWith('user123');
    // Everything is filled in, so it can be sent straight away
    await waitFor(() => expect(screen.getByRole('button', { name: /Submit Report/i })).toBeEnabled());
    // The saved spot wins over GPS
    expect(navigator.geolocation.clearWatch).toHaveBeenCalled();
  });

  it('Start over clears the kept report', async () => {
    loadReportDraft.mockResolvedValue(draft);
    render(<DumpingReportForm />);

    await userEvent.click(await screen.findByRole('button', { name: 'Start over' }));

    expect(clearReportDraft).toHaveBeenCalledWith('user123');
    expect(screen.queryByText(/Your unsent report is back/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Report/i })).toBeDisabled();
  });

  it('asks to sign in again, keeping the report, when the sign-in has ended', async () => {
    loadReportDraft.mockResolvedValue(draft);
    dumpingService.createReport.mockResolvedValue({ data: null, error: { code: 'SESSION_EXPIRED', message: 'Your sign-in has ended.' } });
    render(<DumpingReportForm />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Submit Report/i })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: /Submit Report/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Your sign-in has ended/);
    expect(alert).toHaveTextContent(/kept on this phone/);
    expect(alert).not.toHaveTextContent(/connection/i);
    expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/login?next=%2Freport');
    expect(saveReportDraft).toHaveBeenLastCalledWith('user123', expect.objectContaining({ waste_type: 'mixed' }), expect.any(Array));
    expect(clearReportDraft).not.toHaveBeenCalled();
  });

  it('clears the kept report once it is sent', async () => {
    loadReportDraft.mockResolvedValue(draft);
    dumpingService.createReport.mockResolvedValue({ data: { id: 'abcdef123' }, error: null });
    render(<DumpingReportForm />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Submit Report/i })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: /Submit Report/i }));

    await waitFor(() => expect(clearReportDraft).toHaveBeenCalledWith('user123'));
  });

  it('keeps the report on the phone while it is filled in', async () => {
    render(<DumpingReportForm />);
    await userEvent.click(screen.getByText('Mixed'));

    await waitFor(() => expect(saveReportDraft).toHaveBeenCalledWith('user123', expect.objectContaining({ waste_type: 'mixed' }), []));
  });
});
