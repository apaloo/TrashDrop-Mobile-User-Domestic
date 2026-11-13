import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdditionalInfoStep from '../AdditionalInfoStep.js';
import { toastService } from '../../../services/toastService';

jest.mock('../../../services/toastService', () => ({
  toastService: { success: jest.fn(), info: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));
// The real camera needs getUserMedia; this one hands back a photo per click
jest.mock('../../CameraModal', () => ({ onCapture, onClose }) => (
  <div role="dialog" aria-label="Camera">
    <button type="button" onClick={() => onCapture({ dataUrl: `data:image/jpeg;base64,${Math.random()}` })}>Snap</button>
    <button type="button" onClick={() => onCapture({})}>Snap broken</button>
    <button type="button" onClick={onClose}>Close camera</button>
  </div>
));
jest.mock('../../ui/PhotoViewer.js', () => ({ index, onClose }) => (
  <div role="dialog" aria-label={`Viewer at ${index}`}><button type="button" onClick={onClose}>Close viewer</button></div>
));

const Harness = ({ initial = { frequency: 'one-time', notes: '' }, onChange = () => {}, nextStep = jest.fn() }) => {
  const [formData, setFormData] = useState(initial);
  return (
    <AdditionalInfoStep
      formData={formData}
      updateFormData={(u) => setFormData((f) => { const n = { ...f, ...u }; onChange(n); return n; })}
      nextStep={nextStep}
      prevStep={() => {}}
    />
  );
};

beforeEach(() => jest.clearAllMocks());

describe('AdditionalInfoStep: bin photos and notes', () => {
  test('at least one photo is required to continue', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Take at least one photo to continue.');
  });

  test('photos are stored on the form, at most three, then the camera closes', async () => {
    let latest; const nextStep = jest.fn();
    render(<Harness onChange={(f) => { latest = f; }} nextStep={nextStep} />);
    await userEvent.click(screen.getByRole('button', { name: /Take Photos/ }));
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole('button', { name: 'Snap' }));
    expect(latest.photos).toHaveLength(3);
    expect(screen.queryByRole('dialog', { name: 'Camera' })).not.toBeInTheDocument();
    expect(toastService.info).toHaveBeenCalledWith('Maximum photos reached (3)');
    expect(screen.getByRole('button', { name: /Add More Photos/ })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(nextStep).toHaveBeenCalled();
  });

  test('a broken capture is reported and adds nothing', async () => {
    let latest;
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(<Harness onChange={(f) => { latest = f; }} />);
    await userEvent.click(screen.getByRole('button', { name: /Take Photos/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Snap broken' }));
    log.mockRestore();
    expect(toastService.error).toHaveBeenCalledWith('Failed to capture photo. Please try again.');
    expect(latest).toBeUndefined();
  });

  test('removing a photo updates the form; removing the last one blocks Continue again', async () => {
    let latest;
    render(<Harness initial={{ frequency: 'one-time', notes: '', photos: ['data:a', 'data:b'] }} onChange={(f) => { latest = f; }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(latest.photos).toEqual(['data:b']);
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(latest.photos).toEqual([]);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  test('a photo opens full screen', async () => {
    render(<Harness initial={{ frequency: 'one-time', notes: '', photos: ['data:a', 'data:b'] }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open photo 2 of 2' }));
    expect(screen.getByRole('dialog', { name: 'Viewer at 1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close viewer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('notes are stored; a repeat frequency says this request is one collection', async () => {
    let latest;
    render(<Harness initial={{ frequency: 'weekly', notes: '' }} onChange={(f) => { latest = f; }} />);
    await userEvent.type(screen.getByLabelText(/Additional Notes/), 'Gate code 42');
    expect(latest.notes).toBe('Gate code 42');
    expect(screen.getByText(/Frequency: Weekly - this request is one collection/)).toBeInTheDocument();
  });
});
