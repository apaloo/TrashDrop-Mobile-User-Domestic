import { connectionProblem, withTimeout } from '../connectionProblem.js';

describe('connectionProblem', () => {
  const setOnline = (value) => Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
  afterEach(() => setOnline(true));

  it('says offline when the phone has no connection', () => {
    setOnline(false);
    expect(connectionProblem(null)).toBe('offline');
  });

  it('tells a dropped request from a failing server', () => {
    expect(connectionProblem({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' })).toBe('unreachable');
    expect(connectionProblem({ name: 'AuthRetryableFetchError', status: 503, message: 'Service Unavailable' })).toBe('server');
  });

  it("knows each browser's wording for a dropped request", () => {
    ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.', 'Network request failed']
      .forEach((message) => expect(connectionProblem({ message })).toBe('unreachable'));
  });

  it('reports a timeout as a slow connection', () => {
    expect(connectionProblem({ code: 'SIGN_IN_TIMEOUT', message: 'Sign-in timed out' })).toBe('slow');
  });

  it('leaves account problems alone', () => {
    expect(connectionProblem({ name: 'AuthApiError', status: 400, message: 'Invalid login credentials' })).toBeNull();
    expect(connectionProblem(null)).toBeNull();
  });
});

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('rejects with a timeout when the request hangs', async () => {
    const hanging = withTimeout(new Promise(() => {}), 1000);
    jest.advanceTimersByTime(1000);
    await expect(hanging).rejects.toMatchObject({ code: 'SIGN_IN_TIMEOUT' });
  });

  it('passes the answer through when it arrives in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });
});
