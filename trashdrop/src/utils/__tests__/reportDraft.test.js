// An in-memory stand-in for IndexedDB (jsdom has none)
const mockStore = new Map();
jest.mock('idb', () => ({
  openDB: () => Promise.resolve({
    put: (s, value, key) => { mockStore.set(key, value); return Promise.resolve(); },
    get: (s, key) => Promise.resolve(mockStore.get(key)),
    delete: (s, key) => { mockStore.delete(key); return Promise.resolve(); },
  }),
}));

const { saveReportDraft, loadReportDraft, clearReportDraft, hasDraftContent, DRAFT_MAX_AGE_DAYS } = require('../reportDraft.js');

beforeAll(() => { global.indexedDB = {}; });
afterAll(() => { delete global.indexedDB; });
beforeEach(() => mockStore.clear());

const blob = { size: 3, type: 'image/jpeg' };
const form = { waste_type: 'mixed', estimated_volume: 'small', coordinates: { latitude: 5.6, longitude: -0.2 }, photos: ['blob:x'], description: 'pile' };

describe('report draft', () => {
  it('keeps the fields and photo blobs per user, without device-only URLs', async () => {
    await saveReportDraft('u1', form, [{ id: 'p1', url: 'blob:x', blob }, { id: 'p2', url: 'blob:y' }], 1000);
    const draft = await loadReportDraft('u1', 2000);

    expect(draft.form).toEqual({ waste_type: 'mixed', estimated_volume: 'small', coordinates: { latitude: 5.6, longitude: -0.2 }, description: 'pile' });
    expect(draft.photos).toEqual([{ id: 'p1', blob }]);
    expect(await loadReportDraft('u2', 2000)).toBeNull();
  });

  it(`drops a draft older than ${DRAFT_MAX_AGE_DAYS} days`, async () => {
    await saveReportDraft('u1', form, [], 0);
    expect(await loadReportDraft('u1', (DRAFT_MAX_AGE_DAYS + 1) * 86400000)).toBeNull();
    expect(mockStore.size).toBe(0);
  });

  it('clears a sent report', async () => {
    await saveReportDraft('u1', form, []);
    await clearReportDraft('u1');
    expect(await loadReportDraft('u1')).toBeNull();
  });

  it('does nothing without a user', async () => {
    expect(await saveReportDraft(undefined, form)).toBe(false);
    expect(await loadReportDraft(undefined)).toBeNull();
  });

  it('knows when a form is worth keeping', () => {
    expect(hasDraftContent({ severity: 'medium', coordinates: { latitude: 1, longitude: 2 } }, [])).toBe(false);
    expect(hasDraftContent({}, [{ id: 'p' }])).toBe(true);
    expect(hasDraftContent({ waste_type: 'mixed' })).toBe(true);
    expect(hasDraftContent({ description: '   ' })).toBe(false);
  });
});
