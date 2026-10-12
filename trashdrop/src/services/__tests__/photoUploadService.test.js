import { prepareReportPhotos, isLocalPhotoUrl } from '../photoUploadService.js';
import supabase from '../../utils/supabaseClient.js';

jest.mock('../../utils/supabaseClient.js', () => ({ __esModule: true, default: { storage: { from: jest.fn() } } }));

const STORED = 'https://x.supabase.co/storage/v1/object/public/dumping-photos/u1/1_a.jpg';
const DATA_URL = 'data:image/jpeg;base64,' + btoa('fake-jpeg-bytes');

const mockStorage = ({ failUpload = false } = {}) => {
  const upload = jest.fn(async (path) => (failUpload
    ? { data: null, error: { message: 'bucket not found' } }
    : { data: { path }, error: null }));
  supabase.storage.from.mockReturnValue({
    upload,
    getPublicUrl: (path) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/dumping-photos/${path}` } }),
  });
  return upload;
};

beforeEach(() => jest.clearAllMocks());

describe('prepareReportPhotos', () => {
  it('uploads blob: and data: photos, keeps https, drops anything else, in order', async () => {
    const upload = mockStorage();
    global.fetch = jest.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob(['x'], { type: 'image/jpeg' })) });

    const { urls, failed } = await prepareReportPhotos(['blob:https://app/1', STORED, DATA_URL, 'not a url'], 'u1');

    expect(failed).toBe(0);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(urls).toHaveLength(3);
    expect(urls[1]).toBe(STORED);
    urls.forEach(u => expect(u).toMatch(/^https:\/\/.*\/dumping-photos\/u1\//));
    expect(urls.some(isLocalPhotoUrl)).toBe(false);
  });

  it('counts failures and never returns a blob: or data: URL', async () => {
    mockStorage({ failUpload: true });
    global.fetch = jest.fn().mockRejectedValue(new Error('revoked'));

    const { urls, failed } = await prepareReportPhotos(['blob:https://app/dead', DATA_URL, STORED], 'u1');

    expect(failed).toBe(2);
    expect(urls).toEqual([STORED]);
  });

  it('handles a missing list', async () => {
    await expect(prepareReportPhotos(undefined, 'u1')).resolves.toEqual({ urls: [], failed: 0 });
  });
});
