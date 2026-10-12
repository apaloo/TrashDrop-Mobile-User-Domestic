import { dumpingService } from '../dumpingService.js';
import supabase from '../../utils/supabaseClient.js';
import { prepareReportPhotos } from '../photoUploadService.js';

jest.mock('../../utils/supabaseClient.js', () => ({ __esModule: true, default: { from: jest.fn() } }));
jest.mock('../toastService.js', () => ({ toastService: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../syncService.js', () => ({ __esModule: true, default: {} }));
jest.mock('../photoUploadService.js', () => ({
  prepareReportPhotos: jest.fn(),
  isLocalPhotoUrl: (url) => /^(blob|data):/i.test(url),
}));
jest.mock('../../utils/retryUtils.js', () => ({ retrySupabaseOperation: (fn) => fn() }));

const reportData = (photos) => ({ coordinates: { latitude: 5.6726, longitude: -0.2809 }, waste_type: 'mixed', severity: 'low', photos });

const mockInserts = () => {
  const inserted = [];
  supabase.from.mockImplementation(() => ({
    insert: (rows) => {
      inserted.push(rows[0]);
      return { select: () => Promise.resolve({ data: [{ id: 'r1' }], error: null }) };
    },
  }));
  return inserted;
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
});

describe('createReport photos', () => {
  it('saves the uploaded storage URLs, not the camera blob: URLs', async () => {
    const inserted = mockInserts();
    prepareReportPhotos.mockResolvedValue({ urls: ['https://x/dumping-photos/u1/a.jpg'], failed: 0 });

    const { error } = await dumpingService.createReport('u1', reportData(['blob:https://app/1']));

    expect(error).toBeNull();
    expect(prepareReportPhotos).toHaveBeenCalledWith(['blob:https://app/1'], 'u1');
    expect(inserted[0].photos).toEqual(['https://x/dumping-photos/u1/a.jpg']);
  });

  it('does not save the report when a photo fails to upload', async () => {
    const inserted = mockInserts();
    prepareReportPhotos.mockResolvedValue({ urls: [], failed: 1 });

    const { data, error } = await dumpingService.createReport('u1', reportData(['data:image/jpeg;base64,AAAA']));

    expect(data).toBeNull();
    expect(error.code).toBe('PHOTO_UPLOAD_FAILED');
    expect(error.message).toMatch(/could not be uploaded/);
    expect(inserted).toHaveLength(0);
  });
});
