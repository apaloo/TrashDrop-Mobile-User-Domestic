import { shareOrDownloadQr, qrImageToFile } from '../shareQr.js';

const png = 'data:image/png;base64,iVBORw0KGgo=';
const opts = { src: png, fileName: 'trashdrop-bin-1.png', title: 'QR', text: 'Show this QR' };

let clicked;
beforeEach(() => {
  clicked = [];
  global.fetch = jest.fn(() => Promise.resolve({ blob: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })) }));
  global.URL.createObjectURL = jest.fn(() => 'blob:qr');
  global.URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    clicked.push({ href: this.href, download: this.download });
  });
  delete navigator.share;
  delete navigator.canShare;
});

afterEach(() => jest.restoreAllMocks());

describe('shareOrDownloadQr', () => {
  it('shares the QR as a PNG file (opens the share sheet, e.g. WhatsApp)', async () => {
    navigator.canShare = jest.fn(() => true);
    navigator.share = jest.fn(() => Promise.resolve());

    expect(await shareOrDownloadQr(opts)).toBe('shared');
    const shared = navigator.share.mock.calls[0][0];
    expect(shared.files[0].name).toBe('trashdrop-bin-1.png');
    expect(shared.files[0].type).toBe('image/png');
    expect(shared.text).toBe('Show this QR');
    expect(clicked).toEqual([]);
  });

  it('downloads the PNG when the browser cannot share files', async () => {
    navigator.share = jest.fn();
    navigator.canShare = jest.fn(() => false);

    expect(await shareOrDownloadQr(opts)).toBe('downloaded');
    expect(navigator.share).not.toHaveBeenCalled();
    expect(clicked).toEqual([{ href: 'blob:qr', download: 'trashdrop-bin-1.png' }]);
  });

  it('does nothing more when the user closes the share sheet', async () => {
    navigator.canShare = jest.fn(() => true);
    navigator.share = jest.fn(() => Promise.reject(Object.assign(new Error('cancel'), { name: 'AbortError' })));

    expect(await shareOrDownloadQr(opts)).toBe('cancelled');
    expect(clicked).toEqual([]);
  });

  it('returns null for a missing image', async () => {
    expect(await qrImageToFile(null, 'x.png')).toBeNull();
  });
});
