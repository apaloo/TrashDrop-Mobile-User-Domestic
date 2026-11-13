import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import DigitalBin from '../DigitalBin.js';
import toastService from '../../services/toastService.js';

// Saving a digital bin booking (handleSubmit): which bin location it uses or
// creates, what it refuses, and what it sends. The steps have their own
// tests; here each one fills in its part. The database prices the bin
// (protected pricing rules); this only checks what the page sends and how it
// reads the answer.
const mockAuth = { user: { id: 'u1' }, session: { expires_at: 4102444800 }, isLoading: false };
jest.mock('../../context/AuthContext.js', () => ({ useAuth: () => mockAuth }));

// Every database call is recorded; mockRespond (set per test) answers it
const mockCalls = [];
let mockRespond = () => undefined;
let mockSession = { session: { access_token: 't', user: { id: 'u1' } } };
jest.mock('../../utils/supabaseClient.js', () => {
  const builder = (table) => {
    const call = { table, op: 'select', payload: null, filters: {}, single: false };
    const b = new Proxy({}, {
      get: (_, prop) => {
        if (prop === 'then') {
          mockCalls.push(call);
          const answer = mockRespond(call);
          const fallback = { data: call.op === 'insert' && call.table === 'digital_bins' ? { ...call.payload } : (call.single ? null : []), error: null };
          return (resolve) => resolve(answer || fallback);
        }
        if (prop === 'single' || prop === 'maybeSingle') return () => { call.single = true; return b; };
        if (prop === 'insert' || prop === 'update') return (row) => { call.op = prop; call.payload = row; return b; };
        if (prop === 'eq') return (k, v) => { call.filters[k] = v; return b; };
        return () => b;
      }
    });
    return b;
  };
  return {
    __esModule: true,
    default: {
      from: (table) => builder(table),
      rpc: async () => ({ data: null, error: null }),
      auth: { getSession: async () => ({ data: mockSession, error: null }) }
    }
  };
});

let mockPromo = { isEligible: false, usedCount: 0, maxRequests: 0 };
jest.mock('../../services/promotionalService.js', () => ({
  checkPromotionalEligibility: async () => mockPromo,
  getPromotionalFee: async (size) => ({ clientFee: 10, collectorPayout: 25, platformSubsidy: 15, size }),
  getAllPromotionalFees: async () => []
}));
jest.mock('../../services/digitalBinService.js', () => ({
  prepareDigitalBinData: async (data) => data,
  transformBin: (bin) => bin
}));
jest.mock('../../services/binReminderService.js', () => {
  const actual = jest.requireActual('../../services/binReminderService.js');
  return { ...actual, createReminderPlan: async () => 'plan-1', answerReminder: async () => undefined };
});
jest.mock('../../services/photoUploadService.js', () => ({ uploadPhotos: async () => ({ success: true, publicUrls: [] }) }));
jest.mock('../../services/toastService.js', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('../../hooks/useGpsRefinement.js', () => ({ __esModule: true, default: () => ({}) }));
jest.mock('../../components/digitalBin/ScheduledQRTab.js', () => ({ __esModule: true, default: () => null }));

let mockLocation = {};
let mockSchedule = {};
jest.mock('../../components/digitalBin/LocationStep.js', () => ({
  __esModule: true,
  default: ({ updateFormData, nextStep }) => (
    <button type="button" onClick={() => { updateFormData(mockLocation); nextStep(); }}>Location next</button>
  )
}));
jest.mock('../../components/digitalBin/ScheduleDetailsStep.js', () => ({
  __esModule: true,
  default: ({ updateFormData, nextStep }) => (
    <button type="button" onClick={() => { updateFormData(mockSchedule); nextStep(); }}>Schedule next</button>
  )
}));
jest.mock('../../components/digitalBin/WasteDetailsStep.js', () => ({
  __esModule: true,
  default: ({ nextStep }) => <button type="button" onClick={nextStep}>Waste next</button>
}));
jest.mock('../../components/digitalBin/AdditionalInfoStep.js', () => ({
  __esModule: true,
  default: ({ nextStep }) => <button type="button" onClick={nextStep}>Info next</button>
}));
jest.mock('../../components/digitalBin/ReviewStep.js', () => ({
  __esModule: true,
  default: ({ handleSubmit }) => <button type="button" onClick={handleSubmit}>Submit booking</button>
}));

const book = async () => {
  render(
    <MemoryRouter initialEntries={['/digital-bin']}>
      <Routes>
        <Route path="/digital-bin" element={<DigitalBin />} />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>
  );
  await userEvent.click(await screen.findByRole('button', { name: /New Digital Bin/i }));
  for (const name of ['Location next', 'Schedule next', 'Waste next', 'Info next', 'Submit booking']) {
    await userEvent.click(await screen.findByRole('button', { name }));
  }
};
const callsTo = (table, op) => mockCalls.filter((c) => c.table === table && c.op === op);
const binInsert = () => callsTo('digital_bins', 'insert')[0]?.payload;
const lastToastError = () => toastService.error.mock.calls.at(-1)?.[0];

beforeAll(() => {
  if (!global.crypto) global.crypto = {};
  if (!global.crypto.randomUUID) global.crypto.randomUUID = () => 'bin-1';
  window.scrollTo = () => {};
});

beforeEach(() => {
  mockCalls.length = 0;
  mockRespond = () => undefined;
  mockSession = { session: { access_token: 't', user: { id: 'u1' } } };
  mockPromo = { isEligible: false, usedCount: 0, maxRequests: 0 };
  mockLocation = { latitude: 5.6037, longitude: -0.187, address: 'Osu, Accra', location_name: 'Home' };
  mockSchedule = { frequency: 'one-time', startDate: '2026-11-20', preferredTime: 'morning', bin_size_liters: 120 };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('Saving a digital bin booking: the bin location', () => {
  it('a new spot is saved as a bin location (POINT lng lat) and the bin refers to it', async () => {
    mockRespond = (c) => (c.table === 'bin_locations' && c.op === 'insert' ? { data: { id: 'binloc-new' }, error: null } : undefined);
    await book();
    await screen.findByText('Request submitted');
    expect(callsTo('bin_locations', 'insert')[0].payload).toEqual({
      user_id: 'u1', location_name: 'Home', address: 'Osu, Accra', coordinates: 'POINT(-0.187 5.6037)', is_default: false,
    });
    expect(binInsert()).toMatchObject({ id: 'bin-1', user_id: 'u1', location_id: 'binloc-new', qr_code_url: 'https://app.trashdrops.com/bin/bin-1' });
    expect(toastService.success).toHaveBeenCalledWith('Digital bin created successfully!');
  });

  it('a saved bin location is used and brought up to date, not saved again', async () => {
    mockLocation = { ...mockLocation, location_id: 'binloc-1' };
    mockRespond = (c) => (c.table === 'bin_locations' && c.op === 'select' && c.single ? { data: { id: 'binloc-1' }, error: null } : undefined);
    await book();
    await screen.findByText('Request submitted');
    expect(callsTo('bin_locations', 'insert')).toHaveLength(0);
    const update = callsTo('bin_locations', 'update')[0];
    expect(update.filters).toEqual({ id: 'binloc-1' });
    expect(update.payload).toMatchObject({ coordinates: 'POINT(-0.187 5.6037)', address: 'Osu, Accra' });
    expect(binInsert().location_id).toBe('binloc-1');
  });

  it('a place only in the old locations table is copied into bin_locations, reading its PostGIS point', async () => {
    mockLocation = { ...mockLocation, location_id: 'legacy-1' };
    mockRespond = (c) => {
      if (c.table === 'bin_locations' && c.op === 'select' && c.single) return { data: null, error: { message: 'not found' } };
      if (c.table === 'locations' && c.single) {
        return { data: { id: 'legacy-1', name: 'Shop', address: 'Labone', coordinates: 'POINT(-0.18 5.56)' }, error: null };
      }
      if (c.table === 'bin_locations' && c.op === 'insert') return { data: { id: 'binloc-migrated' }, error: null };
      return undefined;
    };
    await book();
    await screen.findByText('Request submitted');
    expect(callsTo('bin_locations', 'insert')[0].payload).toEqual({
      user_id: 'u1', location_name: 'Shop', address: 'Labone', coordinates: 'POINT(-0.18 5.56)', is_default: false,
    });
    expect(binInsert().location_id).toBe('binloc-migrated');
  });

  it('without a GPS position nothing is saved and the household is told why', async () => {
    mockLocation = { address: 'Osu, Accra', latitude: null, longitude: null };
    await book();
    await waitFor(() => expect(lastToastError()).toMatch(/GPS location is required/));
    expect(callsTo('bin_locations', 'insert')).toHaveLength(0);
    expect(binInsert()).toBeUndefined();
  });

  it('a bin location the database refuses stops the booking: no bin without a saved location', async () => {
    mockRespond = (c) => (c.table === 'bin_locations' && c.op === 'insert' ? { data: null, error: { message: 'new row violates row-level security policy' } } : undefined);
    await book();
    await waitFor(() => expect(toastService.error).toHaveBeenCalled());
    expect(binInsert()).toBeUndefined();
    expect(screen.queryByText('Request submitted')).not.toBeInTheDocument();
  });
});

describe('Saving a digital bin booking: what is sent and refused', () => {
  beforeEach(() => {
    mockRespond = (c) => (c.table === 'bin_locations' && c.op === 'insert' ? { data: { id: 'binloc-new' }, error: null } : undefined);
  });

  it('the preferred date and time ride along in the details, and it stays open a week after that date', async () => {
    await book();
    await screen.findByText('Request submitted');
    const row = binInsert();
    expect(row.details).toMatch(/^Preferred date: 2026-11-20 • Preferred time: /);
    expect(row.bag_count).toBe(1);
    expect(row.is_urgent).toBe(false);
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(new Date(2026, 10, 27).getTime());
  });

  it('a session Supabase no longer has sends the household to sign in, saving nothing', async () => {
    mockSession = { session: null };
    await book();
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(mockCalls.filter((c) => c.op !== 'select')).toHaveLength(0);
  });

  it('a spot outside every service area (TDC01) is explained, not shown as a database error', async () => {
    mockRespond = (c) => {
      if (c.table === 'bin_locations' && c.op === 'insert') return { data: { id: 'binloc-new' }, error: null };
      if (c.table === 'digital_bins' && c.op === 'insert') return { data: null, error: { code: 'TDC01', message: 'outside coverage' } };
      return undefined;
    };
    await book();
    await waitFor(() => expect(lastToastError()).toBe("We haven't started operating at this location yet, so we can't take a pickup request here."));
  });

  it('any other refusal is reported as a failed booking', async () => {
    mockRespond = (c) => {
      if (c.table === 'bin_locations' && c.op === 'insert') return { data: { id: 'binloc-new' }, error: null };
      if (c.table === 'digital_bins' && c.op === 'insert') return { data: null, error: { code: '23514', message: 'check violated' } };
      return undefined;
    };
    await book();
    await waitFor(() => expect(lastToastError()).toBe('Failed to create digital bin: check violated'));
    expect(toastService.success).not.toHaveBeenCalled();
  });

  it('a household with promotional bookings left asks for the next one; the database decides the price', async () => {
    mockPromo = { isEligible: true, usedCount: 1, maxRequests: 3 };
    await book();
    await screen.findByText('Request submitted');
    expect(binInsert()).toMatchObject({
      is_promotional: true, promo_request_number: 2,
      promotional_client_fee: 10, promotional_collector_payout: 25, promotional_platform_subsidy: 15,
    });
  });

  it('an urgent booking is never promotional', async () => {
    mockPromo = { isEligible: true, usedCount: 0, maxRequests: 3 };
    mockSchedule = { ...mockSchedule, is_urgent: true };
    await book();
    await screen.findByText('Request submitted');
    expect(binInsert()).toMatchObject({ is_urgent: true, is_promotional: false, promo_request_number: null, promotional_client_fee: null });
  });
});
