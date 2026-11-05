import { readDeviceTheme } from '../ThemeContext.js';

describe('readDeviceTheme (theme for pages shown before sign-in)', () => {
  afterEach(() => localStorage.clear());

  it('uses the theme last applied on this device', () => {
    localStorage.setItem('trashdrop_theme', 'dark');
    expect(readDeviceTheme()).toBe('dark');
    localStorage.setItem('trashdrop_theme', 'light');
    expect(readDeviceTheme()).toBe('light');
  });

  it('falls back to light when nothing is stored or storage is blocked', () => {
    expect(readDeviceTheme()).toBe('light');
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readDeviceTheme()).toBe('light');
    spy.mockRestore();
  });
});
