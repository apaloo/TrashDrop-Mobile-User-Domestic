/**
 * Unsent dumping report, kept on this phone (IndexedDB) with its photos, so
 * a report survives the sign-in ending mid-report, the app being closed, or
 * the page reloading. One draft per user; kept for DRAFT_MAX_AGE_DAYS.
 *
 * Its own small database, so the app's other offline stores never need a
 * schema upgrade for it. Every call swallows storage errors (private mode,
 * storage full): a draft that can't be kept must never break the form.
 */
import { openDB } from 'idb';

export const DRAFT_MAX_AGE_DAYS = 7;
const DB_NAME = 'trashdrop-drafts';
const STORE = 'drafts';

// No IndexedDB (old browser, some private modes, tests): no drafts, no noise
const available = () => typeof indexedDB !== 'undefined';

let dbPromise = null;
const db = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
};

const keyFor = (userId) => `dumping:${userId}`;

// Form fields worth keeping. Photo URLs are device-only blob: URLs, so the
// photos are kept as blobs instead and given new URLs when restored.
const FIELDS = ['location', 'coordinates', 'description', 'waste_type', 'severity', 'estimated_volume',
  'hazardous_materials', 'accessibility_notes', 'cleanup_priority', 'contact_consent'];

/** True when the form holds something the resident would not want to lose */
export const hasDraftContent = (form, photos = []) =>
  photos.length > 0 || Boolean(form?.waste_type || form?.estimated_volume || form?.description?.trim());

/** Keep (or replace) the user's draft. photos: [{ id, blob }] */
export async function saveReportDraft(userId, form, photos = [], now = Date.now()) {
  if (!userId || !available()) return false;
  try {
    const fields = {};
    FIELDS.forEach((f) => { if (form?.[f] !== undefined) fields[f] = form[f]; });
    const kept = photos.filter((p) => p?.blob).map((p) => ({ id: p.id, blob: p.blob }));
    await (await db()).put(STORE, { savedAt: now, form: fields, photos: kept }, keyFor(userId));
    return true;
  } catch (err) {
    console.warn('[ReportDraft] Could not keep the draft on this phone:', err?.message);
    return false;
  }
}

/** The user's draft ({ savedAt, form, photos: [{ id, blob }] }), or null. Drafts older than DRAFT_MAX_AGE_DAYS are deleted. */
export async function loadReportDraft(userId, now = Date.now()) {
  if (!userId || !available()) return null;
  try {
    const draft = await (await db()).get(STORE, keyFor(userId));
    if (!draft) return null;
    if (!(now - draft.savedAt <= DRAFT_MAX_AGE_DAYS * 86400000)) {
      await clearReportDraft(userId);
      return null;
    }
    return { savedAt: draft.savedAt, form: draft.form || {}, photos: (draft.photos || []).filter((p) => p?.blob) };
  } catch (err) {
    console.warn('[ReportDraft] Could not read the draft:', err?.message);
    return null;
  }
}

export async function clearReportDraft(userId) {
  if (!userId || !available()) return;
  try {
    await (await db()).delete(STORE, keyFor(userId));
  } catch (err) {
    console.warn('[ReportDraft] Could not delete the draft:', err?.message);
  }
}
