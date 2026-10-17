import supabase from '../../utils/supabaseClient.js';
import { checkServiceCoverage, joinCoverageWaitlist, getCoverageArrivals } from '../serviceCoverageService.js';

// The real client validates env on import; only rpc() is involved here
jest.mock('../../utils/supabaseClient.js', () => ({
  __esModule: true,
  default: { rpc: jest.fn() }
}));

const zoneRow = (overrides = {}) => ({
  is_covered: true,
  zone_id: 'z1',
  region: 'Greater Accra',
  district: 'Accra Metro',
  community: 'Ayawaso Central',
  suburb: 'Dzorwulu',
  distance_km: '0.60',
  service_radius_km: '5.00',
  ...overrides
});

describe('checkServiceCoverage', () => {
  beforeEach(() => supabase.rpc.mockReset());

  it('reports a pin inside a zone radius as covered, with that zone', async () => {
    supabase.rpc.mockResolvedValue({ data: [zoneRow()], error: null });

    const result = await checkServiceCoverage(5.6, -0.19);

    expect(supabase.rpc).toHaveBeenCalledWith('check_service_coverage', { p_latitude: 5.6, p_longitude: -0.19 });
    expect(result.status).toBe('covered');
    expect(result.zone.suburb).toBe('Dzorwulu');
    expect(result.zone.distance_km).toBe(0.6);
  });

  it('reports a pin outside every radius as not covered, naming the nearest zone', async () => {
    supabase.rpc.mockResolvedValue({ data: [zoneRow({ is_covered: false, distance_km: '42.31' })], error: null });

    const result = await checkServiceCoverage(6.2, -1.1);

    expect(result.status).toBe('not_covered');
    expect(result.zone.distance_km).toBe(42.31);
  });

  it('treats no zones at all as not covered', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null });

    expect((await checkServiceCoverage(5.6, -0.19)).status).toBe('not_covered');
  });

  it('does not call the database for missing coordinates', async () => {
    expect((await checkServiceCoverage(null, -0.19)).status).toBe('not_covered');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('reports a failing check as unavailable rather than covered', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'statement timeout' } });

    expect((await checkServiceCoverage(5.6, -0.19)).status).toBe('unavailable');
  });

  it('skips the check while the RPC is not yet deployed', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });

    expect((await checkServiceCoverage(5.6, -0.19))).toEqual({ status: 'covered', zone: null });
  });
});

describe('coverage waitlist', () => {
  beforeEach(() => supabase.rpc.mockReset());

  it('joins the waitlist for the pin and its address', async () => {
    supabase.rpc.mockResolvedValue({ data: 'w1', error: null });

    expect(await joinCoverageWaitlist(8.05, -1.73, 'Kintampo')).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('join_coverage_waitlist', {
      p_latitude: 8.05, p_longitude: -1.73, p_address: 'Kintampo'
    });
  });

  it('reports a failed join so the user can try again', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    expect(await joinCoverageWaitlist(8.05, -1.73)).toBe(false);
  });

  it('treats a failed arrival lookup as no arrivals', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    expect(await getCoverageArrivals()).toEqual([]);
  });
});
