const mockUpload = jest.fn();
const mockList = jest.fn();
const mockRemove = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockBucket = jest.fn();

jest.mock('../../utils/supabaseClient.js', () => ({
  __esModule: true,
  default: {
    storage: {
      from: (bucket) => (mockBucket(bucket), {
        upload: mockUpload,
        list: mockList,
        remove: mockRemove,
        getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn.test/avatars/${path}` } }),
      }),
    },
    from: () => ({ update: mockUpdate }),
  },
}));

// jsdom has no image decoding or canvas; stand in for both
function stubImage() {
  global.URL.createObjectURL = jest.fn(() => 'blob:photo');
  global.URL.revokeObjectURL = jest.fn();
  global.Image = class {
    constructor() { this.naturalWidth = 3000; this.naturalHeight = 4000; }
    set src(v) { setTimeout(() => this.onload(), 0); }
  };
  HTMLCanvasElement.prototype.getContext = () => ({ drawImage: jest.fn() });
  HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new Blob(['x'], { type: 'image/jpeg' })); };
}

const { uploadAvatar, AVATAR_BUCKET } = require('../avatarService.js');

beforeEach(() => {
  stubImage();
  mockUpload.mockResolvedValue({ data: {}, error: null });
  mockList.mockResolvedValue({ data: [] });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockEq.mockResolvedValue({ error: null });
});

it('uploads a small JPEG to the user folder and saves only the URL on the profile', async () => {
  const big = new File([new Uint8Array(6 * 1024 * 1024)], 'IMG_1.jpg', { type: 'image/jpeg' });
  const url = await uploadAvatar('user-1', big);

  expect(mockBucket).toHaveBeenCalledWith(AVATAR_BUCKET);
  const [path, blob, opts] = mockUpload.mock.calls[0];
  expect(path).toMatch(/^user-1\/avatar-\d+\.jpg$/);
  expect(blob.size).toBeLessThan(1024);
  expect(opts.contentType).toBe('image/jpeg');

  expect(url).toMatch(/^https:\/\/cdn\.test\/avatars\/user-1\//);
  const saved = mockUpdate.mock.calls[0][0];
  expect(Object.keys(saved).sort()).toEqual(['avatar_url', 'updated_at']);
  expect(saved.avatar_url).toBe(url);
  expect(mockEq).toHaveBeenCalledWith('id', 'user-1');
});

it('reports an upload failure and does not touch the profile', async () => {
  mockUpload.mockResolvedValue({ data: null, error: { message: 'Bucket not found' } });
  const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
  await expect(uploadAvatar('user-1', file)).rejects.toThrow(/^Your photo didn't upload\. Check your connection and try again\.$/);
  expect(mockUpdate).not.toHaveBeenCalled();
});

it('rejects a file that is not a photo', async () => {
  const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
  await expect(uploadAvatar('user-1', file)).rejects.toThrow(/choose a photo/);
});
