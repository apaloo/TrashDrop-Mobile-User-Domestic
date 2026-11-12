// Digital bin review step (protected pricing, docs/DIGITAL_BIN_PRICING.md):
// what the customer is shown before booking. These tests pin today's
// behaviour; the database sets the stored price (td_price_digital_bin).
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReviewStep from '../ReviewStep';

// Plain functions: CRA's resetMocks would wipe jest.fn implementations.
let mockPricing = () => Promise.resolve(null);
let mockPricingCalls = [];
let mockPromoFee = () => Promise.resolve({ clientFee: 22, collectorPayout: 40, platformSubsidy: 18 });
let mockPromoCalls = [];

jest.mock('../../../utils/costCalculator', () => {
  const actual = jest.requireActual('../../../utils/costCalculator');
  return {
    formatCurrency: actual.formatCurrency,
    getBinSizeLabelShort: actual.getBinSizeLabelShort,
    getCostBreakdownWithGPS: (args) => { mockPricingCalls.push(args); return mockPricing(args); },
  };
});
jest.mock('../../../services/promotionalService.js', () => ({
  getPromotionalFee: (size) => { mockPromoCalls.push(size); return mockPromoFee(size); },
}));

const STANDARD = {
  base: 80, urgent_charge: 0, distance_charge: 0, on_site_charges: 0, discount_applied: 0, request_fee: 1, total: 81,
  billable_km: 0, pricing_source: 'gps', pricing_zone: { suburb: 'Osu' },
  display: { urgent_charge: false, distance_charge: false, on_site_charges: false, discount: false },
};

const FORM = {
  address: '12 Oxford St', latitude: 5.556, longitude: -0.182,
  frequency: 'weekly', startDate: '2026-11-20', preferredTime: 'morning',
  numberOfBags: 2, wasteType: 'general', bin_size_liters: 240, is_urgent: false,
};

const showReview = (props = {}) => {
  const submitted = [];
  render(<ReviewStep formData={{ ...FORM, ...(props.formData || {}) }} prevStep={() => {}}
    handleSubmit={() => { submitted.push(true); return Promise.resolve(); }} promoState={props.promoState} />);
  return submitted;
};
const submitButton = () => screen.getByRole('button', { name: /Request Bin Pickup|Processing/ });

beforeEach(() => {
  mockPricing = () => Promise.resolve(STANDARD);
  mockPricingCalls = [];
  mockPromoFee = () => Promise.resolve({ clientFee: 22, collectorPayout: 40, platformSubsidy: 18 });
  mockPromoCalls = [];
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('standard price', () => {
  it('prices the booking from its location and shows the breakdown and total', async () => {
    showReview();
    expect(await screen.findByText('GH₵ 81.00')).toBeInTheDocument();
    expect(screen.getByText('Base (240L × 2)')).toBeInTheDocument();
    expect(screen.getByText('GH₵ 80.00')).toBeInTheDocument();
    expect(screen.getByText('Request fee')).toBeInTheDocument();
    expect(screen.getByText(/Location-based pricing for Osu/)).toBeInTheDocument();
    expect(screen.getByText(/Estimate only/)).toBeInTheDocument();
    expect(mockPricingCalls[0]).toMatchObject({ bin_size_liters: 240, latitude: 5.556, longitude: -0.182, is_urgent: false, bag_count: 2 });
    expect(mockPromoCalls).toEqual([]);
  });

  it('shows the urgent surcharge line when the price has one', async () => {
    mockPricing = () => Promise.resolve({ ...STANDARD, urgent_charge: 24, total: 105, display: { ...STANDARD.display, urgent_charge: true } });
    showReview({ formData: { is_urgent: true } });
    expect(await screen.findByText('Urgent surcharge (30%)')).toBeInTheDocument();
    expect(screen.getByText('GH₵ 24.00')).toBeInTheDocument();
    expect(screen.getByText('GH₵ 105.00')).toBeInTheDocument();
  });

  it('submits once when everything is filled in and priced', async () => {
    const submitted = showReview();
    await screen.findByText('GH₵ 81.00');
    expect(submitButton()).toBeEnabled();
    fireEvent.click(submitButton());
    await waitFor(() => expect(submitted).toEqual([true]));
  });
});

describe('promotional price', () => {
  const promoState = { isEligible: true, usedCount: 1, maxRequests: 5 };

  it('charges the promotional rate per bin and shows the standard price struck through', async () => {
    showReview({ promoState });
    expect(await screen.findByText(/Promotional pricing applied \(request 2 of 5\)/)).toBeInTheDocument();
    expect(mockPromoCalls).toEqual([240]);
    expect(screen.getByText('240L — Promotional Rate × 2')).toBeInTheDocument();
    expect(screen.getAllByText('GH₵ 44.00')).toHaveLength(2); // line and total
    expect(await screen.findByText('GH₵ 81.00')).toHaveClass('line-through');
    expect(screen.getByText(/Promotional flat rate/)).toBeInTheDocument();
  });

  it('does not apply to an urgent booking, and says so', async () => {
    showReview({ promoState, formData: { is_urgent: true } });
    expect(await screen.findByText(/Promotional pricing doesn't apply to urgent pickups/)).toBeInTheDocument();
    expect(mockPromoCalls).toEqual([]);
    expect(screen.queryByText(/Promotional pricing applied/)).toBeNull();
  });

  it('shows the standard price when no promotional fee exists for the bin size', async () => {
    mockPromoFee = () => Promise.resolve({ clientFee: null, collectorPayout: null, platformSubsidy: null });
    showReview({ promoState });
    expect(await screen.findByText('GH₵ 81.00')).toBeInTheDocument();
    expect(screen.getByText('Estimated Cost')).toBeInTheDocument();
    expect(screen.queryByText(/Promotional pricing applied/)).toBeNull();
  });
});

describe('no price, no booking', () => {
  it('blocks submission when prices could not be loaded, and retries on request', async () => {
    mockPricing = () => Promise.reject(new Error('network'));
    showReview();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load prices for your location right now");
    expect(submitButton()).toBeDisabled();
    mockPricing = () => Promise.resolve(STANDARD);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('GH₵ 81.00')).toBeInTheDocument();
    expect(mockPricingCalls).toHaveLength(2);
    expect(submitButton()).toBeEnabled();
  });

  it.each([
    ['not_covered', 'We are not operating here yet', 'Go back to Step 1'],
    ['size_unpriced', 'This bin size is not available here', 'Go back to Step 3'],
  ])('%s: shows why and where to fix it, and blocks submission', async (reason, message, hint) => {
    mockPricing = () => Promise.reject(Object.assign(new Error(message), { reason }));
    showReview();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveTextContent(hint);
    expect(submitButton()).toBeDisabled();
  });

  it('lists what is missing and blocks submission', async () => {
    showReview({ formData: { latitude: null, startDate: '' } });
    await screen.findByText('GH₵ 81.00');
    expect(screen.getByText('Pickup location and GPS coordinates (Step 1: Location)')).toBeInTheDocument();
    expect(screen.getByText('Service frequency, start date and preferred time (Step 2: Schedule)')).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });
});
