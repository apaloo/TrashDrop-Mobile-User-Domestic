import { dumpingService } from '../dumpingService.js';
import supabase from '../../utils/supabaseClient.js';
import { prepareReportPhotos } from '../photoUploadService.js';

// Filing an illegal dumping report: what is refused before anything is sent,
// and how a database refusal is explained to the household (the session and
// photo cases are in dumpingService.session.test.js).
jest.mock('../../utils/supabaseClient.js', () => ({ __esModule: true, default: { from: jest.fn(), auth: { getSession: jest.fn() } } }));
jest.mock('../toastService.js', () => ({ toastService: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../syncService.js', () => ({ __esModule: true, default: {} }));
jest.mock('../photoUploadService.js', () => ({
  prepareReportPhotos: jest.fn(),
  isLocalPhotoUrl: (url) => /^(blob|data):/i.test(url),
}));
jest.mock('../../utils/retryUtils.js', () => ({ retrySupabaseOperation: (fn) => fn() }));

const base = { coordinates: { latitude: 5.6726, longitude: -0.2809 }, waste_type: 'mixed', photos: [] };
let inserted; let insertResult;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
  inserted = [];
  insertResult = { data: [{ id: 'r1' }], error: null };
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
  prepareReportPhotos.mockResolvedValue({ urls: [], failed: 0 });
  supabase.from.mockImplementation((table) => ({
    insert: (rows) => { inserted.push([table, rows]); return { select: () => Promise.resolve(table === 'illegal_dumping_mobile' ? insertResult : { data: [{}], error: null }) }; },
  }));
});
afterEach(() => jest.restoreAllMocks());

const reportsSent = () => inserted.filter(([t]) => t === 'illegal_dumping_mobile');

describe('createReport: refused before anything is sent', () => {
  it.each([
    ['no user', null, base, 'User ID is required'],
    ['no position', 'u1', { ...base, coordinates: null }, 'Coordinates (latitude and longitude) are required'],
    ['a position that is not numbers', 'u1', { ...base, coordinates: { latitude: '5.6', longitude: '-0.2' } }, 'Coordinates (latitude and longitude) are required'],
    ['an unknown severity', 'u1', { ...base, severity: 'extreme' }, 'Invalid severity value. Must be one of: low, medium, high'],
    ['an unknown size', 'u1', { ...base, size: 'huge' }, 'Invalid size value. Must be one of: small, medium, large'],
    ['a photo that is not a link', 'u1', { ...base, photos: ['not a url'] }, 'Invalid photo URL format'],
    ['an empty photo entry', 'u1', { ...base, photos: [''] }, 'Invalid photo URL format'],
  ])('%s', async (_label, user, data, message) => {
    const r = await dumpingService.createReport(user, data);
    expect(r.data).toBeNull();
    expect(r.error.message).toBe(message);
    expect(reportsSent()).toEqual([]);
  });
});

describe('createReport: what is sent', () => {
  it('a position given as a GeoJSON point is read as [longitude, latitude]', async () => {
    const r = await dumpingService.createReport('u1', { ...base, coordinates: { type: 'Point', coordinates: [-0.2809, 5.6726] } });
    expect(r.error).toBeNull();
    const [, [report]] = reportsSent()[0];
    expect(report).toMatchObject({ reported_by: 'u1', status: 'pending' });
    expect(JSON.stringify(report)).toContain('-0.2809');
  });

  it('linked photos (https) are accepted as they are', async () => {
    const r = await dumpingService.createReport('u1', { ...base, severity: 'high', size: 'large', photos: ['https://cdn.example.org/a.jpg'] });
    expect(r.error).toBeNull();
    expect(reportsSent()).toHaveLength(1);
  });
});

describe('createReport: a database refusal, explained', () => {
  it.each([
    ['row-level security', { code: '42501', message: 'new row violates row-level security policy' }],
    ['an account the database does not know', { code: '23503', message: 'insert violates foreign key constraint "reported_by_fkey"' }],
  ])('%s: sign out and back in (never "check your connection")', async (_label, error) => {
    insertResult = { data: null, error };
    const r = await dumpingService.createReport('u1', base);
    expect(r.data).toBeNull();
    expect(r.error.message).toBe('Failed to submit report due to user validation issues. Please try logging out and back in.');
  });

  it('a schema problem is named as one', async () => {
    insertResult = { data: null, error: { message: 'column "foo" does not exist' } };
    const r = await dumpingService.createReport('u1', base);
    expect(r.error.message).toBe('Database schema error: column "foo" does not exist');
  });

  it('anything else passes its message through', async () => {
    insertResult = { data: null, error: { message: 'Location (6.1, 1.2) is outside Ghana and Liberia.' } };
    const r = await dumpingService.createReport('u1', base);
    expect(r.error.message).toBe('Location (6.1, 1.2) is outside Ghana and Liberia.');
  });
});
