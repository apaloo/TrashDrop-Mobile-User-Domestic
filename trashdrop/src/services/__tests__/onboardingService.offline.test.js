import onboardingService from '../onboardingService.js';
import supabase from '../../utils/supabaseClient.js';

jest.mock('../../utils/supabaseClient.js', () => ({ __esModule: true, default: { rpc: jest.fn(), from: jest.fn() } }));

const setOnline = (value) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
const dropped = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' };
const emptyTable = () => {
  const builder = new Proxy({}, {
    get: (_, prop) => (prop === 'then' ? (resolve) => resolve({ data: null, error: dropped, count: null }) : () => builder),
  });
  return builder;
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  supabase.from.mockImplementation(emptyTable);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  setOnline(true);
  jest.restoreAllMocks();
});

describe('Setup screen without a connection', () => {
  it('offline: does not treat the account as new, and asks nothing of the server', async () => {
    setOnline(false);
    const result = await onboardingService.checkOnboardingStatus('user-1');
    expect(result).toEqual({ show: false, startingStep: null, unknown: true });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('phone says online but requests drop: still does not treat the account as new', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: dropped });
    const result = await onboardingService.checkOnboardingStatus('user-1');
    expect(result.show).toBe(false);
    expect(result.unknown).toBe(true);
  });

  it('a real server error still uses the existing fallback', async () => {
    const fallback = jest.spyOn(onboardingService, 'fallbackCheckOnboarding').mockResolvedValue({ show: true, startingStep: 'welcome' });
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist', code: '42883' } });
    expect((await onboardingService.checkOnboardingStatus('user-1')).show).toBe(true);
    expect(fallback).toHaveBeenCalled();
  });
});

describe('The "do you have bags" answer', () => {
  it('online: saves straight away and leaves nothing waiting', async () => {
    supabase.rpc.mockResolvedValue({ data: { next_step: 'choose_service' }, error: null });
    expect(await onboardingService.saveHasBagsChoice('user-1', false)).toEqual({ saved: true });
    expect(supabase.rpc).toHaveBeenCalledWith('set_has_bags', { user_uuid: 'user-1', has_bags: false });
    expect(localStorage.getItem('trashdrop_has_bags_pending_user-1')).toBeNull();
  });

  it('offline: keeps the answer, does not throw, and does not call the server', async () => {
    setOnline(false);
    expect(await onboardingService.saveHasBagsChoice('user-1', false)).toEqual({ saved: false });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(localStorage.getItem('trashdrop_has_bags_user-1')).toBe('false');
    expect(localStorage.getItem('trashdrop_has_bags_pending_user-1')).toBe('false');
  });

  it('a dropped request: keeps the answer and does not throw', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: dropped });
    expect(await onboardingService.saveHasBagsChoice('user-1', true)).toEqual({ saved: false });
    expect(localStorage.getItem('trashdrop_has_bags_pending_user-1')).toBe('true');
  });

  it('sends a waiting answer once online, once only', async () => {
    localStorage.setItem('trashdrop_has_bags_pending_user-1', 'false');
    supabase.rpc.mockResolvedValue({ data: {}, error: null });

    await onboardingService.flushHasBagsChoice('user-1');
    await onboardingService.flushHasBagsChoice('user-1');

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('set_has_bags', { user_uuid: 'user-1', has_bags: false });
    expect(localStorage.getItem('trashdrop_has_bags_pending_user-1')).toBeNull();
  });

  it('keeps the answer waiting if sending it fails again', async () => {
    localStorage.setItem('trashdrop_has_bags_pending_user-1', 'true');
    supabase.rpc.mockResolvedValue({ data: null, error: dropped });
    await expect(onboardingService.flushHasBagsChoice('user-1')).resolves.toBeUndefined();
    expect(localStorage.getItem('trashdrop_has_bags_pending_user-1')).toBe('true');
  });
});
