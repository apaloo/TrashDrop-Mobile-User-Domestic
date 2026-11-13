/**
 * Shared phones: one household's data must not show to the next person who
 * signs in on the same device (found 2026-11-13: the digital bin list, with
 * each bin's QR link and address, stayed in localStorage after sign-out and
 * showed to the next account until the server answered, and indefinitely
 * offline).
 *
 * Display caches whose key doesn't carry the user id are cleared on sign-out.
 * Unsynced offline work (digitalBinsList / digitalBin_*, illegalDumping*,
 * pending_location_sync / location_*) is kept so nobody loses work they
 * haven't sent yet; the database refuses to file it under another account.
 */
export const HOUSEHOLD_CACHE_KEYS = [
  'digitalBins',               // the digital bin list (QR links, addresses)
  'digitalBinActiveTab',
  'trashdrop_locations',       // saved locations, when cached before sign-in finished
  'trashdrop_qr_scanned',      // onboarding: bag scanned
  'trashdrop_qr_batch_id',
  'trashdrop_qr_bag_count',
  'trashdrop_location_saved',  // onboarding: location saved
];
export const HOUSEHOLD_CACHE_PREFIXES = ['qr_']; // one cached QR image per bin

const storageOrNull = () => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

/** Remove the household display caches. Returns how many keys were removed. */
export function clearHouseholdCaches(storage = storageOrNull()) {
  if (!storage) return 0;
  let removed = 0;
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
    keys
      .filter((k) => k && (HOUSEHOLD_CACHE_KEYS.includes(k) || HOUSEHOLD_CACHE_PREFIXES.some((p) => k.startsWith(p))))
      .forEach((k) => { storage.removeItem(k); removed++; });
  } catch {
    // Private mode or blocked storage: nothing was cached either
  }
  return removed;
}

/**
 * The cached digital bins that belong to this user; never anyone else's.
 * Bins without an owner recorded (cached by older versions) are not shown.
 */
export function cachedBinsFor(userId, storage = storageOrNull()) {
  if (!userId || !storage) return [];
  try {
    const bins = JSON.parse(storage.getItem('digitalBins') || '[]');
    return Array.isArray(bins) ? bins.filter((b) => b && b.user_id === userId) : [];
  } catch {
    return [];
  }
}
