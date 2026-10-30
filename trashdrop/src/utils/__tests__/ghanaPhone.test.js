import { normalizeGhanaPhone, formatGhanaPhone } from '../ghanaPhone';

describe('Ghana mobile numbers for airtime rewards', () => {
  it('accepts local, spaced and international forms', () => {
    expect(normalizeGhanaPhone('0244123456')).toBe('0244123456');
    expect(normalizeGhanaPhone('024 412 3456')).toBe('0244123456');
    expect(normalizeGhanaPhone('+233244123456')).toBe('0244123456');
    expect(normalizeGhanaPhone('233 55 123 4567')).toBe('0551234567');
    expect(normalizeGhanaPhone('244123456')).toBe('0244123456');
  });

  it('rejects numbers that are not Ghana mobiles', () => {
    expect(normalizeGhanaPhone('')).toBeNull();
    expect(normalizeGhanaPhone('0302123456')).toBeNull(); // landline
    expect(normalizeGhanaPhone('02441234')).toBeNull();
    expect(normalizeGhanaPhone('+44 7700 900123')).toBeNull();
  });

  it('formats for display', () => {
    expect(formatGhanaPhone('0244123456')).toBe('024 412 3456');
  });
});
