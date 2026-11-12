import { dumpingService, SESSION_EXPIRED_MESSAGE } from '../dumpingService.js';
import supabase from '../../utils/supabaseClient.js';
import { prepareReportPhotos } from '../photoUploadService.js';

// TD44: a sign-in that ended mid-report made every photo upload fail as
// signed out, and the resident was told to check their connection.
jest.mock('../../utils/supabaseClient.js', () => ({ __esModule: true, default: { from: jest.fn(), auth: { getSession: jest.fn() } } }));
jest.mock('../toastService.js', () => ({ toastService: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../syncService.js', () => ({ __esModule: true, default: {} }));
jest.mock('../photoUploadService.js', () => ({
  prepareReportPhotos: jest.fn(),
  isLocalPhotoUrl: (url) => /^(blob|data):/i.test(url),
}));
jest.mock('../../utils/retryUtils.js', () => ({ retrySupabaseOperation: (fn) => fn() }));

const reportData = { coordinates: { latitude: 5.6726, longitude: -0.2809 }, waste_type: 'mixed', photos: ['blob:https://app/1'] };
const signedIn = { data: { session: { user: { id: 'u1' } } }, error: null };
const signedOut = { data: { session: null }, error: null };

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
  supabase.from.mockImplementation(() => ({
    insert: () => ({ select: () => Promise.resolve({ data: [{ id: 'r1' }], error: null }) }),
  }));
});

describe('createReport when the sign-in has ended', () => {
  it('says to sign in again, without uploading, when there is no session', async () => {
    supabase.auth.getSession.mockResolvedValue(signedOut);

    const { data, error } = await dumpingService.createReport('u1', reportData);

    expect(data).toBeNull();
    expect(error.code).toBe('SESSION_EXPIRED');
    expect(error.message).toBe(SESSION_EXPIRED_MESSAGE);
    expect(error.message).not.toMatch(/connection/i);
    expect(prepareReportPhotos).not.toHaveBeenCalled();
  });

  it('says to sign in again when the sign-in ends while the photos upload', async () => {
    supabase.auth.getSession.mockResolvedValueOnce(signedIn).mockResolvedValueOnce(signedOut);
    prepareReportPhotos.mockResolvedValue({ urls: [], failed: 2 });

    const { error } = await dumpingService.createReport('u1', reportData);

    expect(error.code).toBe('SESSION_EXPIRED');
  });

  it('still blames the upload when the sign-in is fine', async () => {
    supabase.auth.getSession.mockResolvedValue(signedIn);
    prepareReportPhotos.mockResolvedValue({ urls: [], failed: 1 });

    const { error } = await dumpingService.createReport('u1', reportData);

    expect(error.code).toBe('PHOTO_UPLOAD_FAILED');
  });

  it('does not treat a failed session lookup (no connection) as signed out', async () => {
    supabase.auth.getSession.mockRejectedValue(new Error('Failed to fetch'));
    prepareReportPhotos.mockResolvedValue({ urls: ['https://x/a.jpg'], failed: 0 });

    const { data, error } = await dumpingService.createReport('u1', reportData);

    expect(error).toBeNull();
    expect(data.id).toBe('r1');
  });
});
