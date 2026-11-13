import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScheduleDetailsStep, { localToday } from '../ScheduleDetailsStep.js';

const Harness = ({ initial, onChange = () => {}, nextStep = jest.fn() }) => {
  const [formData, setFormData] = useState(initial);
  return (
    <ScheduleDetailsStep
      formData={formData}
      updateFormData={(u) => setFormData((f) => { const n = { ...f, ...u }; onChange(n); return n; })}
      nextStep={nextStep}
      prevStep={() => {}}
    />
  );
};

const shift = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return localToday(d); };
// The defaults DigitalBin.js starts the form with
const DEFAULTS = { frequency: 'one-time', startDate: '', preferredTime: 'morning' };

describe('ScheduleDetailsStep', () => {
  test('localToday is the local calendar date, not the UTC one', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(localToday(new Date(2026, 11, 31, 0, 5))).toBe('2026-12-31');
  });

  test('a date is required; today or later can continue', async () => {
    const nextStep = jest.fn();
    render(<Harness initial={DEFAULTS} nextStep={nextStep} />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Select start date to continue.');

    fireEvent.change(screen.getByLabelText('Pickup Date'), { target: { value: localToday() } });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(nextStep).toHaveBeenCalled();
  });

  test('the picker starts at today', () => {
    render(<Harness initial={DEFAULTS} />);
    expect(screen.getByLabelText('Pickup Date')).toHaveAttribute('min', localToday());
  });

  test('a past date (typed in, or from an old reminder) blocks Continue and says why', async () => {
    const nextStep = jest.fn();
    render(<Harness initial={{ ...DEFAULTS, startDate: shift(-3) }} nextStep={nextStep} />);
    const date = screen.getByLabelText('Pickup Date');
    expect(date).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('This date has passed. Choose today or a later date.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Select a pickup date from today on to continue.');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    fireEvent.change(date, { target: { value: shift(2) } });
    expect(date).not.toHaveAttribute('aria-invalid');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(nextStep).toHaveBeenCalled();
  });

  test('frequency and time are stored, and repeat frequencies explain that each collection is booked from a reminder', async () => {
    let latest;
    render(<Harness initial={{ ...DEFAULTS, startDate: shift(1) }} onChange={(f) => { latest = f; }} />);
    expect(screen.getByText('We collect once, on the date you choose.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Weekly/ }));
    expect(latest.frequency).toBe('weekly');
    expect(screen.getByText(/This books the first collection/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Evening/ }));
    expect(latest.preferredTime).toBe('evening');
  });
});
