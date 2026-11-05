import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DigitalBin from '../DigitalBin.js';
import { answerReminder, createReminderPlan } from '../../services/binReminderService.js';

jest.mock('../../context/AuthContext.js', () => ({
  useAuth: () => ({ user: { id: 'u1' }, session: { expires_at: 4102444800 }, isLoading: false })
}));

// Every insert into digital_bins is recorded and answered with bin-1
const mockInserts = [];
jest.mock('../../utils/supabaseClient.js', () => {
  const builder = (table) => {
    let single = false;
    let inserted = null;
    const b = new Proxy({}, {
      get: (_, prop) => {
        if (prop === 'then') {
          const data = inserted
            ? { ...inserted, id: 'bin-1' }
            : single ? { id: 'loc-1', location_name: 'Home', address: 'Vitin Estate' } : [];
          return (resolve) => resolve({ data, error: null });
        }
        if (prop === 'single' || prop === 'maybeSingle') return () => { single = true; return b; };
        if (prop === 'insert') return (row) => { if (table === 'digital_bins') { inserted = row; mockInserts.push(row); } return b; };
        return () => b;
      }
    });
    return b;
  };
  return { __esModule: true, default: { from: (table) => builder(table), rpc: async () => ({ data: null, error: null }) } };
});

jest.mock('../../services/binReminderService.js', () => {
  const actual = jest.requireActual('../../services/binReminderService.js');
  return { ...actual, createReminderPlan: jest.fn(), answerReminder: jest.fn() };
});
jest.mock('../../services/digitalBinService.js', () => ({
  prepareDigitalBinData: async (data) => data,
  transformBin: (bin) => bin
}));
jest.mock('../../services/promotionalService.js', () => ({
  checkPromotionalEligibility: async () => ({ isEligible: false, usedCount: 0, maxRequests: 0 }),
  getPromotionalFee: async () => ({}),
  getAllPromotionalFees: async () => []
}));
jest.mock('../../services/photoUploadService.js', () => ({ uploadPhotos: async () => ({ success: true, publicUrls: [] }) }));
jest.mock('../../services/toastService.js', () => ({ __esModule: true, default: { success: () => {}, error: () => {}, info: () => {} } }));
jest.mock('../../hooks/useGpsRefinement.js', () => ({ __esModule: true, default: () => ({}) }));
jest.mock('../../components/digitalBin/ScheduledQRTab.js', () => ({ __esModule: true, default: () => null }));

// The steps themselves have their own tests; here each one fills in its part
jest.mock('../../components/digitalBin/LocationStep.js', () => ({
  __esModule: true,
  default: ({ updateFormData, nextStep }) => (
    <button type="button" onClick={() => { updateFormData({ location_id: 'loc-1', latitude: 9.38, longitude: -0.81, address: 'Vitin Estate' }); nextStep(); }}>
      Location next
    </button>
  )
}));
jest.mock('../../components/digitalBin/ScheduleDetailsStep.js', () => ({
  __esModule: true,
  default: ({ updateFormData, nextStep }) => (
    <>
      <button type="button" onClick={() => { updateFormData({ frequency: 'weekly', startDate: '2026-11-10', preferredTime: 'evening' }); nextStep(); }}>Weekly next</button>
      <button type="button" onClick={() => { updateFormData({ frequency: 'one-time', startDate: '2026-11-10' }); nextStep(); }}>One-time next</button>
    </>
  )
}));
jest.mock('../../components/digitalBin/WasteDetailsStep.js', () => ({
  __esModule: true,
  default: ({ nextStep }) => <button type="button" onClick={nextStep}>Waste next</button>
}));
jest.mock('../../components/digitalBin/AdditionalInfoStep.js', () => ({
  __esModule: true,
  default: ({ formData, updateFormData, nextStep }) => (
    <div>
      <pre data-testid="form-data">{JSON.stringify(formData)}</pre>
      <button type="button" onClick={() => { updateFormData({ photos: ['blob:photo'] }); nextStep(); }}>Photo next</button>
    </div>
  )
}));
jest.mock('../../components/digitalBin/ReviewStep.js', () => ({
  __esModule: true,
  default: ({ handleSubmit }) => <button type="button" onClick={handleSubmit}>Submit booking</button>
}));

const REMINDER = {
  reminder_id: 'rem-1',
  plan_id: 'plan-1',
  due_date: '2026-11-13',
  frequency: 'weekly',
  preferred_time: 'afternoon',
  location_id: 'loc-1',
  location_name: 'Home',
  address: 'Vitin Estate',
  latitude: 9.38,
  longitude: -0.81,
  bin_size_liters: 240,
  waste_type: 'recycling',
  bag_count: 2,
  notes: 'Gate code 12'
};

const renderPage = (state) => render(
  <MemoryRouter initialEntries={[{ pathname: '/digital-bin', state }]}>
    <DigitalBin />
  </MemoryRouter>
);

const formData = () => JSON.parse(screen.getByTestId('form-data').textContent);

beforeAll(() => {
  // jsdom has no crypto.randomUUID; the page mints the bin id with it
  if (!global.crypto) global.crypto = {};
  if (!global.crypto.randomUUID) global.crypto.randomUUID = () => 'bin-1';
  window.scrollTo = () => {};
});

beforeEach(() => {
  mockInserts.length = 0;
  createReminderPlan.mockResolvedValue('plan-new');
  answerReminder.mockResolvedValue(undefined);
});

describe('Digital bin bookings and collection reminders', () => {
  it('a reminder opens the form at the photo step with the collection filled in, and booking answers it', async () => {
    renderPage({ bookFromReminder: REMINDER });

    expect(await screen.findByText(/Step 4 of 5/)).toBeInTheDocument();
    expect(formData()).toMatchObject({
      location_id: 'loc-1',
      frequency: 'weekly',
      startDate: '2026-11-13',
      preferredTime: 'afternoon',
      bin_size_liters: 240,
      wasteType: 'recycling',
      numberOfBags: 2,
      notes: 'Gate code 12',
      is_urgent: false
    });

    await userEvent.click(screen.getByRole('button', { name: 'Photo next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit booking' }));

    await waitFor(() => expect(answerReminder).toHaveBeenCalledWith('rem-1', 'booked', 'bin-1'));
    expect(createReminderPlan).not.toHaveBeenCalled();
    expect(mockInserts[0]).toMatchObject({ location_id: 'loc-1', frequency: 'weekly', bag_count: 2 });
  });

  it('a weekly booking saves a reminder plan and says so', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /New Digital Bin/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Location next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Weekly next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Waste next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Photo next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit booking' }));

    await waitFor(() => expect(createReminderPlan).toHaveBeenCalledWith({
      binId: 'bin-1', startDate: '2026-11-10', preferredTime: 'evening', notes: ''
    }));
    expect(answerReminder).not.toHaveBeenCalled();
    expect(await screen.findByTestId('reminders-on')).toHaveTextContent(/day before each weekly collection/);

    // Open for a week after its collection date, not a week after today
    const expires = new Date(mockInserts[0].expires_at);
    expect(expires.getTime()).toBeGreaterThan(new Date(2026, 10, 17).getTime());
  });

  it('a one-time booking sets up no reminders', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /New Digital Bin/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Location next' }));
    await userEvent.click(screen.getByRole('button', { name: 'One-time next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Waste next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Photo next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit booking' }));

    await screen.findByText('Request submitted');
    expect(createReminderPlan).not.toHaveBeenCalled();
    expect(screen.queryByTestId('reminders-on')).not.toBeInTheDocument();
  });
});
