import { scrub, scrubEvent, initMonitoring, captureError, isMonitoringEnabled } from '../monitoring';

describe('monitoring', () => {
  test('stays off without a DSN', () => {
    expect(initMonitoring()).toBe(false);
    expect(isMonitoringEnabled()).toBe(false);
    expect(() => captureError(new Error('x'))).not.toThrow();
  });

  test('masks Ghana phone/MoMo numbers and emails', () => {
    expect(scrub('MoMo 0241234567 failed')).toBe('MoMo [number] failed');
    expect(scrub('call +233241234567')).toBe('call [number]');
    expect(scrub('user ama@example.com')).toBe('user [email]');
    expect(scrub('3 bags')).toBe('3 bags');
  });

  test('scrubEvent drops request bodies and keeps only the user id', () => {
    const e = scrubEvent({
      message: 'pay 0551234567',
      exception: { values: [{ value: 'bad email kofi@x.io' }] },
      request: { data: '{"momo":"0551234567"}', cookies: 'a=b', url: 'https://app/x?phone=0551234567' },
      user: { id: 'u1', email: 'kofi@x.io', ip_address: '1.2.3.4' },
      breadcrumbs: [{ message: 'typed 0201234567' }],
    });
    expect(e.message).toBe('pay [number]');
    expect(e.exception.values[0].value).toBe('bad email [email]');
    expect(e.request.data).toBeUndefined();
    expect(e.request.cookies).toBeUndefined();
    expect(e.request.url).toBe('https://app/x?phone=[number]');
    expect(e.user).toEqual({ id: 'u1' });
    expect(e.breadcrumbs[0].message).toBe('typed [number]');
  });
});
