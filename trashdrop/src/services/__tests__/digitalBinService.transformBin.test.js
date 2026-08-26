import { transformBin } from '../digitalBinService.js';

// gpsPricingService reaches for supabase (and its env validation) on import,
// and none of that is involved in the status mapping under test
jest.mock('../gpsPricingService.js', () => ({ __esModule: true, default: {} }));

// A digital_bins row exactly as the database returns it: `status` is the
// database's own vocabulary, which starts at 'pending'. The list's tabs match
// 'active' | 'completed' | 'cancelled', so anything that skips this mapping
// falls out of every tab.
const dbRow = (overrides = {}) => ({
  id: 'bin-1',
  location_id: 'loc-1',
  is_active: true,
  status: 'pending',
  collected_at: null,
  ...overrides
});

describe('transformBin status mapping', () => {
  it('maps a freshly inserted pending bin to active', () => {
    expect(transformBin(dbRow()).status).toBe('active');
  });

  it('maps a deactivated bin to cancelled', () => {
    expect(transformBin(dbRow({ is_active: false })).status).toBe('cancelled');
  });

  it('treats a collected bin as completed even while is_active is true', () => {
    expect(transformBin(dbRow({ collected_at: '2026-08-26T18:00:00Z' })).status)
      .toBe('completed');
  });

  it.each(['completed', 'disposed'])('maps a %s bin to completed', (status) => {
    expect(transformBin(dbRow({ status })).status).toBe('completed');
  });

  it('is idempotent, so re-transforming a list row does not change it', () => {
    const once = transformBin(dbRow());
    expect(transformBin(once).status).toBe('active');
  });

  it('resolves location fields from the bin_locations join', () => {
    const row = transformBin(dbRow({
      bin_locations: { location_name: 'Home', address: 'Vitin Estate, Tamale' }
    }));
    expect(row).toMatchObject({ location_name: 'Home', address: 'Vitin Estate, Tamale' });
  });

  it('keeps already-resolved location fields over the join', () => {
    const row = transformBin(dbRow({
      location_name: 'Office',
      bin_locations: { location_name: 'Home', address: 'Vitin Estate' }
    }));
    expect(row.location_name).toBe('Office');
  });
});

describe('realtime payload merge (regression)', () => {
  // The photo-upload write in DigitalBin.handleSubmit updates digital_bins a
  // few seconds after the insert. That UPDATE arrives on the live channel as a
  // raw row, and merging it in unmapped used to overwrite the list-facing
  // 'active' with the database's 'pending' - dropping a just-created bin out
  // of all three tabs while the success banner pointed at it.
  it('survives a raw realtime payload merged over a list row', () => {
    const listRow = transformBin(dbRow({
      bin_locations: { location_name: 'Home', address: 'Vitin Estate' }
    }));
    const realtimePayload = dbRow({ photo_urls: ['https://example.test/a.jpg'] });

    const merged = transformBin({
      ...listRow,
      ...realtimePayload,
      location_name: realtimePayload.location_name || listRow.location_name,
      address: realtimePayload.address || listRow.address
    });

    expect(merged.status).toBe('active');
    expect(merged.location_name).toBe('Home');
    expect(merged.photo_urls).toEqual(['https://example.test/a.jpg']);

    // And the shape that caused the bug: merged raw, the row lands on a status
    // none of the tab filters match, so the bin renders nowhere at all
    const TAB_STATUSES = ['active', 'in_service', 'completed', 'cancelled'];
    const mergedRaw = { ...listRow, ...realtimePayload };
    expect(TAB_STATUSES).not.toContain(mergedRaw.status);
  });

  it('still lets a genuine cancellation through', () => {
    const listRow = transformBin(dbRow());
    const merged = transformBin({ ...listRow, ...dbRow({ is_active: false }) });
    expect(merged.status).toBe('cancelled');
  });
});
