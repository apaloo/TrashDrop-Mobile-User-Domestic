import { pickupService } from '../pickupService.js';
import supabase from '../../utils/supabaseClient.js';

// pickupService carries the household's live pickup (dashboard, tracking map,
// cancel). These tests pin what it does today (TD33: it had 1% coverage).
// Checked against production on 2026-11-12: every column it selects exists,
// and a resident's cancel succeeds.
jest.mock('../../utils/supabaseClient.js', () => ({ __esModule: true, default: { from: jest.fn(), rpc: jest.fn() } }));

/**
 * A stand-in for the Supabase query builder: every chained call is recorded,
 * and awaiting the query (or .single()/.maybeSingle()) gives the result set
 * for that table.
 */
const mockDatabase = (tables, rpcs = {}) => {
  const calls = [];
  supabase.from.mockImplementation((table) => {
    const call = { table, ops: [] };
    calls.push(call);
    const result = () => Promise.resolve(tables[table] ?? { data: [], error: null });
    const builder = {
      then: (resolve, reject) => result().then(resolve, reject),
      single: () => result(),
      maybeSingle: () => result(),
    };
    ['select', 'eq', 'in', 'order', 'limit', 'update', 'insert'].forEach((op) => {
      builder[op] = (...args) => { call.ops.push([op, ...args]); return builder; };
    });
    return builder;
  });
  supabase.rpc.mockImplementation((name) => {
    const res = Promise.resolve(rpcs[name] ?? { data: null, error: null });
    return { then: (a, b) => res.then(a, b), maybeSingle: () => res };
  });
  return calls;
};

// Fresh rows per use: getActivePickup attaches the collector to the row it gets back
const oneTimeRow = () => ({ id: 'p1', status: 'accepted', collector_id: 'c1', address: '12 Ring Road', fee: 20, bag_count: 2, waste_type: 'mixed', created_at: '2026-11-12T08:00:00Z' });
const binRow = () => ({ id: 'b1', status: 'pending', location_id: 'loc1', qr_code_url: 'https://qr/b1', fee: 35, bag_count: 1, frequency: 'weekly' });
const scheduledRow = () => ({ id: 's1', status: 'pending', pickup_date: '2026-11-20', bag_count: 3 });

beforeEach(() => jest.clearAllMocks());

describe('getActivePickup', () => {
  it('needs a user', async () => {
    const { data, error } = await pickupService.getActivePickup(undefined);
    expect(data).toBeNull();
    expect(error.message).toBe('User ID is required');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('prefers a one-time pickup over a digital bin and a scheduled pickup', async () => {
    mockDatabase(
      { pickup_requests: { data: [oneTimeRow()], error: null }, digital_bins: { data: [binRow()], error: null }, scheduled_pickups: { data: [scheduledRow()], error: null } },
      { td_collector_display_profile: { data: { user_id: 'c1', first_name: 'Ama', last_name: 'Mensah' }, error: null } },
    );

    const { data, error } = await pickupService.getActivePickup('u1');

    expect(error).toBeNull();
    expect(data).toMatchObject({ id: 'p1', status: 'accepted', fee: 20, bag_count: 2, address: '12 Ring Road', is_digital_bin: false, collector_name: 'Ama Mensah' });
    expect(data.collector).toMatchObject({ id: 'c1', first_name: 'Ama' });
  });

  it("only looks at the user's own pickups that are still open", async () => {
    const calls = mockDatabase({});
    await pickupService.getActivePickup('u1');

    const open = ['pending', 'accepted', 'en_route', 'arrived', 'collecting'];
    for (const table of ['pickup_requests', 'scheduled_pickups', 'digital_bins']) {
      const call = calls.find((c) => c.table === table);
      expect(call.ops).toContainEqual(['eq', 'user_id', 'u1']);
      expect(call.ops).toContainEqual(['in', 'status', open]);
    }
  });

  it('shows a digital bin, with its location, when there is no one-time pickup', async () => {
    mockDatabase(
      { pickup_requests: { data: [], error: null }, digital_bins: { data: [binRow()], error: null }, bin_locations: { data: { location_name: 'Home', address: 'East Legon' }, error: null } },
      { get_bin_coordinates_wkt: { data: 'POINT(-0.15 5.63)', error: null } },
    );

    const { data } = await pickupService.getActivePickup('u1');

    expect(data).toMatchObject({ id: 'b1', is_digital_bin: true, qr_code_url: 'https://qr/b1', fee: 35, frequency: 'weekly' });
    expect(data.location).toMatchObject({ location_name: 'Home', address: 'East Legon', latitude: 5.63, longitude: -0.15 });
    expect(data.address).toBe('East Legon');
  });

  it('falls back to a scheduled pickup', async () => {
    mockDatabase({ scheduled_pickups: { data: [scheduledRow()], error: null } });
    const { data } = await pickupService.getActivePickup('u1');
    expect(data).toMatchObject({ id: 's1', is_scheduled: true, scheduled_date: '2026-11-20', bag_count: 3 });
  });

  it('shows the coordinates when a pickup has no address', async () => {
    mockDatabase(
      { pickup_requests: { data: [{ ...oneTimeRow(), address: null, collector_id: null }], error: null } },
      { get_request_coordinates_wkt: { data: 'POINT(-0.2 5.6)', error: null } },
    );
    const { data } = await pickupService.getActivePickup('u1');
    expect(data.address).toBe('5.60000, -0.20000');
    expect(data.collector_name).toBeNull();
  });

  it('is null when nothing is open', async () => {
    mockDatabase({});
    expect(await pickupService.getActivePickup('u1')).toEqual({ data: null, error: null });
  });

  it('reports a failed pickup query instead of saying there is none', async () => {
    mockDatabase({ pickup_requests: { data: null, error: { message: 'permission denied', code: '42501' } } });
    const { data, error } = await pickupService.getActivePickup('u1');
    expect(data).toBeNull();
    expect(error).toEqual({ message: 'permission denied', code: '42501' });
  });

  it('still shows a one-time pickup when the digital bin query fails', async () => {
    mockDatabase({ pickup_requests: { data: [{ ...oneTimeRow(), collector_id: null }], error: null }, digital_bins: { data: null, error: { message: 'timeout' } } });
    const { data, error } = await pickupService.getActivePickup('u1');
    expect(error).toBeNull();
    expect(data.id).toBe('p1');
  });
});

describe('cancelPickupRequest', () => {
  it('marks only that request cancelled, with the reason', async () => {
    const calls = mockDatabase({ pickup_requests: { data: { id: 'p1', status: 'cancelled' }, error: null } });

    const { data, error } = await pickupService.cancelPickupRequest('p1', 'Cancelled by user');

    expect(error).toBeNull();
    expect(data.status).toBe('cancelled');
    const call = calls.find((c) => c.table === 'pickup_requests');
    const update = call.ops.find(([op]) => op === 'update')[1];
    expect(update).toMatchObject({ status: 'cancelled', cancellation_reason: 'Cancelled by user' });
    expect(typeof update.updated_at).toBe('string');
    expect(call.ops).toContainEqual(['eq', 'id', 'p1']);
  });

  it('passes on a refusal from the database (for example the status flow)', async () => {
    mockDatabase({ pickup_requests: { data: null, error: { message: 'Invalid status transition', code: 'P0001' } } });
    const { data, error } = await pickupService.cancelPickupRequest('p1');
    expect(data).toBeNull();
    expect(error).toEqual({ message: 'Invalid status transition', code: 'P0001' });
  });
});

describe('updatePickupStatus', () => {
  it('needs a pickup and a status', async () => {
    const { error } = await pickupService.updatePickupStatus('p1');
    expect(error.message).toBe('Pickup ID and status are required');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('stamps accepted_at when a pickup is accepted, unless one is given', async () => {
    const calls = mockDatabase({ pickup_requests: { data: { id: 'p1' }, error: null } });
    await pickupService.updatePickupStatus('p1', 'accepted');
    await pickupService.updatePickupStatus('p1', 'accepted', { accepted_at: '2026-11-12T09:00:00Z' });
    const updates = calls.map((c) => c.ops.find(([op]) => op === 'update')[1]);
    expect(typeof updates[0].accepted_at).toBe('string');
    expect(updates[1].accepted_at).toBe('2026-11-12T09:00:00Z');
  });
});

describe('getPickupDetails (collector tracking page)', () => {
  it('needs a pickup id', async () => {
    const { error } = await pickupService.getPickupDetails('');
    expect(error.message).toBe('Pickup ID is required');
  });

  it('returns the request with its coordinates and collector', async () => {
    mockDatabase(
      { pickup_requests: { data: oneTimeRow(), error: null } },
      {
        get_request_coordinates_wkt: { data: 'POINT(-0.2 5.6)', error: null },
        td_collector_display_profile: { data: { user_id: 'c1', first_name: 'Ama' }, error: null },
      },
    );
    const { data, error } = await pickupService.getPickupDetails('p1');
    expect(error).toBeNull();
    expect(data).toMatchObject({ id: 'p1', coordinates: 'POINT(-0.2 5.6)', collector: { id: 'c1', first_name: 'Ama' } });
    expect(supabase.rpc).toHaveBeenCalledWith('get_request_coordinates_wkt', { request_id: 'p1' });
  });

  it('falls back to a digital bin with the same id', async () => {
    mockDatabase(
      { pickup_requests: { data: null, error: null }, digital_bins: { data: binRow(), error: null }, bin_locations: { data: { id: 'loc1', location_name: 'Home' }, error: null } },
      { get_bin_coordinates_wkt: { data: 'POINT(-0.15 5.63)', error: null } },
    );
    const { data } = await pickupService.getPickupDetails('b1');
    expect(data).toMatchObject({ id: 'b1', is_digital_bin: true, frequency: 'weekly', location: { location_name: 'Home', latitude: 5.63, longitude: -0.15 } });
  });

  it('is null when neither exists', async () => {
    mockDatabase({ pickup_requests: { data: null, error: null }, digital_bins: { data: null, error: null } });
    expect(await pickupService.getPickupDetails('nope')).toEqual({ data: null, error: null });
  });
});
