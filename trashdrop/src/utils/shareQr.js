/**
 * Share or save a digital bin QR code as an image.
 *
 * Whoever holds the QR can confirm the collection and pay the collector, so
 * the household can send it (e.g. on WhatsApp) to someone who will be home.
 * Phones get the share sheet with the PNG attached; where the browser can't
 * share files, the PNG is downloaded instead so it can be sent from the gallery.
 */

/** The QR image (data: URL or web URL) as a PNG File, or null if it can't be read */
export const qrImageToFile = async (src, fileName) => {
  if (!src) return null;
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    return new File([blob], fileName, { type: blob.type || 'image/png' });
  } catch {
    return null;
  }
};

/** Save the QR image to the device */
export const downloadQr = async (src, fileName) => {
  const file = await qrImageToFile(src, fileName);
  const href = file ? URL.createObjectURL(file) : src;
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (file) setTimeout(() => URL.revokeObjectURL(href), 1000);
};

/**
 * Share the QR image; falls back to downloading it.
 * @returns {Promise<'shared'|'downloaded'|'cancelled'>}
 */
export const shareOrDownloadQr = async ({ src, fileName, title, text }) => {
  const file = await qrImageToFile(src, fileName);

  if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled'; // closed the share sheet
      // fall through to download
    }
  }

  await downloadQr(src, fileName);
  return 'downloaded';
};
