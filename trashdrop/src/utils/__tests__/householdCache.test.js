// Shared phones (2026-11-13): one household's bins must not show to the next
// account signed in on the same device.
import { clearHouseholdCaches, cachedBinsFor, HOUSEHOLD_CACHE_KEYS } from '../householdCache.js';

beforeEach(() => localStorage.clear());

describe('clearHouseholdCaches (sign-out)', () => {
  test('removes the display caches and the per-bin QR copies', () => {
    HOUSEHOLD_CACHE_KEYS.forEach((k) => localStorage.setItem(k, 'x'));
    localStorage.setItem('qr_bin-1', 'data:image/png;base64,AAA');
    localStorage.setItem('qr_bin-2', 'data:image/png;base64,BBB');
    expect(clearHouseholdCaches()).toBe(HOUSEHOLD_CACHE_KEYS.length + 2);
    HOUSEHOLD_CACHE_KEYS.forEach((k) => expect(localStorage.getItem(k)).toBeNull());
    expect(localStorage.getItem('qr_bin-1')).toBeNull();
  });

  test('keeps unsynced offline work and settings', () => {
    const keep = {
      digitalBinsList: '["local-1"]', 'digitalBin_local-1': '{}', illegalDumpingList: '["r1"]', illegalDumping_r1: '{}',
      pending_location_sync: '["l1"]', location_l1: '{}', trashdrop_theme: 'dark', 'trashdrop_locations_u-1': '[]',
    };
    Object.entries(keep).forEach(([k, v]) => localStorage.setItem(k, v));
    localStorage.setItem('digitalBins', '[]');
    clearHouseholdCaches();
    Object.entries(keep).forEach(([k, v]) => expect(localStorage.getItem(k)).toBe(v));
  });

  test('blocked storage is not an error', () => {
    const broken = { get length() { throw new Error('SecurityError'); } };
    expect(clearHouseholdCaches(broken)).toBe(0);
    expect(clearHouseholdCaches(null)).toBe(0);
  });
});

describe('cachedBinsFor', () => {
  test('only this user\'s bins; bins without an owner are not shown', () => {
    localStorage.setItem('digitalBins', JSON.stringify([
      { id: 'a', user_id: 'u-1' }, { id: 'b', user_id: 'u-2' }, { id: 'c' }, null,
    ]));
    expect(cachedBinsFor('u-1').map((b) => b.id)).toEqual(['a']);
    expect(cachedBinsFor('u-2').map((b) => b.id)).toEqual(['b']);
    expect(cachedBinsFor(null)).toEqual([]);
  });

  test('a damaged cache shows nothing', () => {
    localStorage.setItem('digitalBins', '{not json');
    expect(cachedBinsFor('u-1')).toEqual([]);
    localStorage.setItem('digitalBins', '{"id":"a"}');
    expect(cachedBinsFor('u-1')).toEqual([]);
  });
});
