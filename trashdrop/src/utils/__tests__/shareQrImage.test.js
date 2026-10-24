import QRCode from 'qrcode';
import { shareQrImage, downloadQrImage, qrImageDataUrl } from '../shareQrImage.js';

// jsdom can't run the QR library's canvas code; check what it is asked to draw
jest.mock('qrcode', () => ({ __esModule: true, default: { toDataURL: jest.fn() } }));

// 1×1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const bin = { id: '2f4e8642-dede-4f38-94e2-f0ea90d23bac', qrImage: PNG, location: { address: 'Pokuase, Accra' } };

beforeEach(() => {
  global.fetch = async () => ({ blob: async () => new Blob(['png'], { type: 'image/png' }) });
  delete navigator.share;
  delete navigator.canShare;
});

describe('sharing a digital bin QR code', () => {
  it('shares the QR image (for WhatsApp etc.) where the phone can share images', async () => {
    let shared;
    navigator.canShare = () => true;
    navigator.share = async (payload) => { shared = payload; };
    await expect(shareQrImage(bin)).resolves.toBe('shared');
    expect(shared.files[0].name).toBe('trashdrop-bin-2f4e8642.png');
    expect(shared.files[0].type).toBe('image/png');
    expect(shared.text).toContain('Pokuase, Accra');
  });

  it('saves the image where images cannot be shared', async () => {
    const clicks = [];
    const spy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { clicks.push(this.download); });
    await expect(shareQrImage(bin)).resolves.toBe('downloaded');
    expect(clicks).toEqual(['trashdrop-bin-2f4e8642.png']);
    spy.mockRestore();
  });

  it('treats closing the share sheet as cancelled, not an error', async () => {
    navigator.canShare = () => true;
    navigator.share = async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e; };
    await expect(shareQrImage(bin)).resolves.toBe('cancelled');
  });

  it('draws the QR from the bin link when the card has no image yet', async () => {
    QRCode.toDataURL.mockResolvedValue('data:image/png;base64,drawn');
    await expect(qrImageDataUrl({ id: 'abc', qr_code_url: 'https://trashdrop.app/bin/abc' })).resolves.toBe('data:image/png;base64,drawn');
    expect(QRCode.toDataURL).toHaveBeenCalledWith('https://trashdrop.app/bin/abc', expect.any(Object));
  });

  it('reports unavailable only when there is nothing to draw', async () => {
    await expect(shareQrImage({})).resolves.toBe('unavailable');
    await expect(downloadQrImage({})).resolves.toBe(false);
  });
});
