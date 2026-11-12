import { safeReturnPath, returnPathFrom } from '../returnPath.js';

describe('safeReturnPath', () => {
  it('keeps pages inside the app', () => {
    expect(safeReturnPath('/report')).toBe('/report');
    expect(safeReturnPath('/activity?tab=reports')).toBe('/activity?tab=reports');
  });

  it('refuses other sites and odd paths', () => {
    ['https://evil.example/x', '//evil.example', '/\\evil.example', 'report', '', null, undefined, 42, '/report\nx']
      .forEach((p) => expect(safeReturnPath(p)).toBeNull());
  });

  it('never returns to the sign-in pages or the start page', () => {
    ['/login', '/register', '/login?next=/report', '/'].forEach((p) => expect(safeReturnPath(p)).toBeNull());
  });
});

describe('returnPathFrom', () => {
  it('uses ?next= first, then the route guard state', () => {
    expect(returnPathFrom({ search: '?next=%2Freport', state: { from: { pathname: '/rewards' } } })).toBe('/report');
    expect(returnPathFrom({ search: '', state: { from: { pathname: '/rewards', search: '?x=1' } } })).toBe('/rewards?x=1');
  });

  it('is null when there is nowhere safe to go', () => {
    expect(returnPathFrom({ search: '?next=https://evil.example' })).toBeNull();
    expect(returnPathFrom({})).toBeNull();
    expect(returnPathFrom(undefined)).toBeNull();
  });
});
