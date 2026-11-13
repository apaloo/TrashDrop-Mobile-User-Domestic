import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WasteDetailsStep from '../WasteDetailsStep.js';

// The step only needs the size list and labels; pricing itself is tested elsewhere
jest.mock('../../../services/gpsPricingService.js', () => ({ __esModule: true, default: {}, PricingUnavailableError: class extends Error {} }));

// The defaults DigitalBin.js starts the form with
const DEFAULTS = { numberOfBags: 1, wasteType: 'general', bin_size_liters: 120, is_urgent: false };

const Harness = ({ initial = DEFAULTS, promoState, onChange = () => {}, nextStep = jest.fn() }) => {
  const [formData, setFormData] = useState(initial);
  return (
    <WasteDetailsStep
      formData={formData}
      updateFormData={(u) => setFormData((f) => { const n = { ...f, ...u }; onChange(n); return n; })}
      nextStep={nextStep}
      prevStep={() => {}}
      promoState={promoState}
    />
  );
};

describe('WasteDetailsStep: what the booking is priced from', () => {
  test('the default form can continue', async () => {
    const nextStep = jest.fn();
    render(<Harness nextStep={nextStep} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(nextStep).toHaveBeenCalled();
  });

  test('bin count, size, type and urgency are stored as the booking reads them', async () => {
    let latest;
    render(<Harness onChange={(f) => { latest = f; }} />);
    await userEvent.click(screen.getByRole('button', { name: /^3\s*Bins$/ }));
    expect(latest).toMatchObject({ numberOfBags: '3', bag_count: 3 });
    expect(screen.getByRole('button', { name: /^3\s*Bins$/ })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.selectOptions(screen.getByLabelText(/Bin Size/), '240');
    expect(latest.bin_size_liters).toBe(240); // a number, as pricing expects

    await userEvent.click(screen.getByRole('button', { name: /Recycling/ }));
    expect(latest).toMatchObject({ wasteType: 'recycling', waste_type: 'recycling' });

    await userEvent.click(screen.getByLabelText(/Mark as Urgent/));
    expect(latest.is_urgent).toBe(true);
  });

  test('only sizes pricing knows are offered', () => {
    render(<Harness />);
    const sizes = screen.getAllByRole('option').map((o) => Number(o.value));
    expect(sizes).toEqual([60, 80, 90, 100, 120, 240, 340, 360, 660, 1100]);
  });

  test('waste types match the digital_bins check constraint', () => {
    render(<Harness />);
    ['General Waste', 'Recycling', 'Organic Waste'].forEach((t) => expect(screen.getByRole('button', { name: new RegExp(t) })).toBeInTheDocument());
  });

  test('missing choices disable Continue and say what is missing', () => {
    const nextStep = jest.fn();
    render(<Harness initial={{ is_urgent: false }} nextStep={nextStep} />);
    const next = screen.getByRole('button', { name: 'Continue' });
    expect(next).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Select number of bins, waste type, bin size to continue.');
  });

  test('promotional pricing shows the pickups left, only when eligible', () => {
    const { rerender } = render(<Harness promoState={{ isEligible: true, usedCount: 1, maxRequests: 3 }} />);
    expect(screen.getByText('2 of 3 discounted pickups remaining')).toBeInTheDocument();
    expect(screen.getByText(/not for urgent pickups/)).toBeInTheDocument();
    rerender(<Harness promoState={{ isEligible: false, usedCount: 3, maxRequests: 3 }} />);
    expect(screen.queryByText(/Promotional pricing active/)).not.toBeInTheDocument();
  });
});
