import onboardingService from '../onboardingService.js';
import supabase from '../../utils/supabaseClient.js';

jest.mock('../../utils/supabaseClient.js', () => ({ __esModule: true, default: { rpc: jest.fn(), from: jest.fn() } }));

// A query builder that resolves to the count given for its table
const counts = (byTable) => (table) => {
  const builder = new Proxy({}, {
    get: (_, prop) => (prop === 'then'
      ? (resolve) => resolve({ data: null, error: null, count: byTable[table] ?? 0 })
      : () => builder),
  });
  return builder;
};

beforeEach(() => {
  jest.clearAllMocks();
  try { localStorage.clear(); } catch (e) { /* ignore */ }
  supabase.rpc.mockImplementation((name) => Promise.resolve(name === 'get_user_onboarding_state'
    ? { data: { state: 'LOCATION_SET' }, error: null }
    : { data: { selection_made: true, has_bags: false }, error: null }));
});

describe('"Complete Your Setup" on a new device', () => {
  it('is not shown again to an account that already has a digital bin', async () => {
    supabase.from.mockImplementation(counts({ digital_bins: 2, pickup_requests: 0 }));
    const result = await onboardingService.checkOnboardingStatus('user-1');
    expect(result.show).toBe(false);
    expect(localStorage.getItem('trashdrop_onboarding_dismissed_user-1')).toBe('true');
  });

  it('is not shown to an account that already has a pickup request', async () => {
    supabase.from.mockImplementation(counts({ digital_bins: 0, pickup_requests: 1 }));
    expect((await onboardingService.checkOnboardingStatus('user-1')).show).toBe(false);
  });

  it('still shows for an account with no bin or pickup yet', async () => {
    supabase.from.mockImplementation(counts({}));
    expect(await onboardingService.checkOnboardingStatus('user-1')).toEqual({ show: true, startingStep: 'digital_bin' });
  });
});
