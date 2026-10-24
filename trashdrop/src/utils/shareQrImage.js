import QRCode from 'qrcode';

// Sharing or saving a digital bin's QR code as an image, so someone at home
// can show it to the collector (who scans it to confirm the pickup and take
// payment) when the customer isn't there.

const fileName = (binId) => `trashdrop-bin-${String(binId || 'qr').slice(0, 8)}.png`;

export const qrShareText = (bin) => [
  'TrashDrop Digital Bin QR code.',
  'Show this to the TrashDrop collector when they arrive so they can confirm the pickup.',
  bin?.location?.address || bin?.location_name ? `Location: ${bin.location?.address || bin.location_name}` : null,
].filter(Boolean).join('\n');

/**
 * The QR image as a PNG data URL: the image the card already shows, else one
 * drawn from the bin's QR link (https://trashdrop.app/bin/<id>), else null.
 */
export const qrImageDataUrl = async (bin) => {
  if (bin?.qrImage && String(bin.qrImage).startsWith('data:image/')) return bin.qrImage;
  const link = bin?.qr_code_url || (bin?.id ? `https://trashdrop.app/bin/${bin.id}` : null);
  if (!link) return null;
  return QRCode.toDataURL(link, { width: 512, margin: 2, errorCorrectionLevel: 'M' });
};

const dataUrlToFile = async (dataUrl, name) => {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type || 'image/png' });
};

/** Save the QR image to the device */
export const downloadQrImage = async (bin) => {
  const dataUrl = await qrImageDataUrl(bin);
  if (!dataUrl) return false;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName(bin?.id);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
};

/**
 * Share the QR image through the phone's share sheet (WhatsApp, SMS, email…).
 * Where images can't be shared (most desktop browsers), save it instead.
 * @returns {Promise<'shared'|'downloaded'|'cancelled'|'unavailable'>}
 */
export const shareQrImage = async (bin) => {
  const dataUrl = await qrImageDataUrl(bin);
  if (!dataUrl) return 'unavailable';

  const file = await dataUrlToFile(dataUrl, fileName(bin?.id));
  const payload = { files: [file], title: 'TrashDrop Digital Bin QR Code', text: qrShareText(bin) };
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share(payload);
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled'; // closed the share sheet
      throw error;
    }
  }

  await downloadQrImage({ ...bin, qrImage: dataUrl });
  return 'downloaded';
};
