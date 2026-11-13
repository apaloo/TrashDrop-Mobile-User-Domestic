import { pickupService } from '../pickupService.js';
import supabase from '../../utils/supabaseClient.js';

// The household's active pickup on the dashboard: the digital bin's place
// (its saved location and coordinates, with the fallback when the coordinate
// lookup isn't available), its collector, and the address shown when none was
// stored. pickupService.test.js covers the order between sources and errors.
jest.mock('../../utils/supabaseClient.js', () => ({ __esModule: true, default: { from: jest.fn(), rpc: jest.fn() } }));

/** tables: { name: result | (ops) => result }; rpcs: { name: result | Error (rejects) } */
const mockDatabase = (tables, rpcs = {}) => {
  const calls = [];
  supabase.from.mockImplementation((table) => {
    const call = { table, ops: [] };
    calls.push(call);
    const result = () => {
      const t = tables[table];
      return Promise.resolve(typeof t === 'function' ? t(call.ops) : (t ?? { data: [], error: null }));
    };
    const builder = { then: (a, b) => result().then(a, b), single: () => result(), maybeSingle: () => result() };
    ['select', 'eq', 'in', 'order', 'limit'].forEach((op) => { builder[op] = (...args) => { call.ops.push([op, ...args]); return builder; }; });
    return builder;
  });
  supabase.rpc.mockImplementation((name, args) => {
    calls.push({ rpc: name, args });
    const r = rpcs[name];
    const res = r instanceof Error ? Promise.reject(r) : Promise.resolve(r ?? { data: null, error: null });
    return { then: (a, b) => res.then(a, b), maybeSingle: () => res };
  });
  return calls;
};
const selected = (ops) => ops.find(([op]) => op === 'select')?.[1] || '';

const bin = (extra = {}) => ({ id: 'b1', status: 'accepted', location_id: 'loc1', qr_code_url: 'https://qr/b1', fee: 35, bag_count: 1, collector_id: 'c9', ...extra });
const binLocation = { location_name: 'Home', address: '4 Palm St, Madina' };
const collector = { data: { user_id: 'c9', first_name: 'Kofi', last_name: 'Asante', phone: '+233200000000' }, error: null };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('getActivePickup: a digital bin', () => {
  it('shows the bin with its saved place, coordinates and collector', async () => {
    const calls = mockDatabase(
      { digital_bins: { data: [bin()], error: null }, bin_locations: { data: { ...binLocation }, error: null } },
      { td_collector_display_profile: collector, get_bin_coordinates_wkt: { data: 'POINT(-0.16 5.68)', error: null } },
    );
    const { data, error } = await pickupService.getActivePickup('u1');
    expect(error).toBeNull();
    expect(data).toMatchObject({
      id: 'b1', is_digital_bin: true, is_scheduled: false, address: '4 Palm St, Madina', fee: 35,
      collector_id: 'c9', collector_name: 'Kofi Asante',
      location: { location_name: 'Home', address: '4 Palm St, Madina', latitude: 5.68, longitude: -0.16 },
    });
    expect(calls).toContainEqual({ rpc: 'get_bin_coordinates_wkt', args: { bin_location_id: 'loc1' } });
    // a bin's place comes from bin_locations, never the saved-locations table
    expect(calls.map((c) => c.table)).not.toContain('locations');
  });

  it('when the coordinate lookup is not available, reads the coordinates as text instead', async () => {
    const calls = mockDatabase(
      {
        digital_bins: { data: [bin({ collector_id: null })], error: null },
        bin_locations: (ops) => (selected(ops) === 'coordinates::text'
          ? { data: { coordinates: 'POINT(-0.2 5.6)' }, error: null }
          : { data: { ...binLocation }, error: null }),
      },
      { get_bin_coordinates_wkt: new Error('function get_bin_coordinates_wkt does not exist') },
    );
    const { data } = await pickupService.getActivePickup('u1');
    expect(data.location).toMatchObject({ coordinates: 'POINT(-0.2 5.6)', latitude: 5.6, longitude: -0.2 });
    expect(calls.filter((c) => c.table === 'bin_locations').map((c) => selected(c.ops))).toEqual(['location_name, address', 'coordinates::text']);
    expect(data.collector).toBeNull();
    expect(data.collector_name).toBeNull();
  });

  it('a bin whose place or collector cannot be read still shows, without them', async () => {
    mockDatabase(
      { digital_bins: { data: [bin()], error: null }, bin_locations: { data: null, error: { message: 'not found' } } },
      { td_collector_display_profile: new Error('network') },
    );
    const { data, error } = await pickupService.getActivePickup('u1');
    expect(error).toBeNull();
    expect(data).toMatchObject({ id: 'b1', collector: null, address: null });
  });

  it('a failed digital-bin read is not fatal: a scheduled pickup still shows', async () => {
    mockDatabase({
      digital_bins: { data: null, error: { message: 'permission denied' } },
      scheduled_pickups: { data: [{ id: 's1', status: 'pending', pickup_date: '2026-11-20', bag_count: 3, location_id: 'L1' }], error: null },
      locations: { data: { location_name: 'Office', address: '7 Oxford St', latitude: 5.55, longitude: -0.18 }, error: null },
    });
    const { data, error } = await pickupService.getActivePickup('u1');
    expect(error).toBeNull();
    expect(data).toMatchObject({ id: 's1', is_scheduled: true, scheduled_date: '2026-11-20', address: '7 Oxford St', bags: 3 });
  });
});

describe('getActivePickup: a one-time pickup', () => {
  const request = (extra = {}) => ({ id: 'p1', status: 'en_route', collector_id: null, address: null, fee: 20, estimated_volume: 2, created_at: '2026-11-12T08:00:00Z', ...extra });

  it('with no stored address, shows its coordinates (looked up as text when the lookup is not available)', async () => {
    const calls = mockDatabase(
      { pickup_requests: (ops) => (selected(ops) === 'coordinates::text' ? { data: { coordinates: 'POINT(-0.187 5.6037)' }, error: null } : { data: [request()], error: null }) },
      { get_request_coordinates_wkt: new Error('missing') },
    );
    const { data } = await pickupService.getActivePickup('u1');
    expect(data).toMatchObject({ id: 'p1', address: '5.60370, -0.18700', coordinates: 'POINT(-0.187 5.6037)', bags: 2 });
    expect(calls).toContainEqual({ rpc: 'get_request_coordinates_wkt', args: { request_id: 'p1' } });
  });

  it('with neither address nor coordinates, shows no address rather than a made-up one', async () => {
    mockDatabase({ pickup_requests: (ops) => (selected(ops) === 'coordinates::text' ? { data: null, error: null } : { data: [request()], error: null }) });
    const { data } = await pickupService.getActivePickup('u1');
    expect(data.address).toBeNull();
  });

  it('a failed pickup read is an error, not "no active pickup"', async () => {
    mockDatabase({ pickup_requests: { data: null, error: { message: 'timeout', code: '57014' } } });
    const { data, error } = await pickupService.getActivePickup('u1');
    expect(data).toBeNull();
    expect(error).toEqual({ message: 'timeout', code: '57014' });
  });
});
