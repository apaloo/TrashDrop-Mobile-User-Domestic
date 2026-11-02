import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SubmissionModal, CONFIRMATION_SECONDS } from '../DumpingReportForm.js';

jest.mock('../../context/AuthContext.js');
jest.mock('../../services/dumpingService.js');
jest.mock('../../services/notificationService.js');
jest.mock('../CameraModal.js', () => () => null);

const summary = {
  reference: '7430FB37',
  wasteType: 'Mixed waste',
  volume: 'Large',
  severity: 'high',
  photoCount: 6,
  coordinates: { latitude: 5.69588, longitude: -0.24778 },
  hazardous: false
};

describe('Report submitted popup', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('is a dialog with the reference and summary', () => {
    render(<SubmissionModal summary={summary} onDone={jest.fn()} onReportAnother={jest.fn()} />);
    const dialog = screen.getByRole('dialog', { name: /Report submitted - reference 7430FB37/i });
    expect(dialog).toHaveTextContent('Mixed waste, Large, high severity, 6 photos at 5.69588, -0.24778.');
    expect(dialog).toHaveTextContent(`Returning to Dashboard in ${CONFIRMATION_SECONDS}s`);
  });

  it('returns to the dashboard after 10 seconds when nothing is pressed', () => {
    const onDone = jest.fn();
    render(<SubmissionModal summary={summary} onDone={onDone} onReportAnother={jest.fn()} />);

    act(() => { jest.advanceTimersByTime(9000); });
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText('Returning to Dashboard in 1s')).toBeInTheDocument();

    act(() => { jest.advanceTimersByTime(1000); });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(summary);
  });

  it('does not return to the dashboard once Report another site is pressed', () => {
    const onDone = jest.fn();
    const Host = () => {
      const [open, setOpen] = React.useState(true);
      return open ? <SubmissionModal summary={summary} onDone={onDone} onReportAnother={() => setOpen(false)} /> : null;
    };
    render(<Host />);

    fireEvent.click(screen.getByRole('button', { name: 'Report another site' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => { jest.advanceTimersByTime(CONFIRMATION_SECONDS * 1000); });
    expect(onDone).not.toHaveBeenCalled();
  });

  it('Back to Dashboard goes straight away', () => {
    const onDone = jest.fn();
    render(<SubmissionModal summary={summary} onDone={onDone} onReportAnother={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to Dashboard' }));
    expect(onDone).toHaveBeenCalledWith(summary);
  });
});
