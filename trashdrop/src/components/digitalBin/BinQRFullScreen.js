import React, { useEffect, useRef, useState } from 'react';
import { FiX } from 'react-icons/fi';
import { getQRCode, storeQRCode } from '../../utils/qrStorage.js';

/**
 * The bin's QR code as an image, the same one My Digital Bin shows: read from
 * the phone if it was made before, otherwise made now (on the phone, so it
 * works without signal) and kept for next time. See QRCodeList's QRCodeCard.
 */
export const ensureBinQR = async (binId, locationId = null) => {
  if (!binId) return null;
  const stored = await getQRCode(binId);
  if (stored?.qrCodeUrl?.startsWith('data:')) return stored.qrCodeUrl;
  const made = await storeQRCode(binId, null, { locationId, syncToSupabase: true });
  return made?.qrCodeUrl || null;
};

/**
 * Full-screen QR code for the collector to scan: white, large, and the screen
 * kept awake while it is open.
 */
const BinQRFullScreen = ({ binId, locationId = null, locationName = '', arrived = false, onClose }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setQrCodeUrl(null);
    setFailed(false);
    ensureBinQR(binId, locationId)
      .then((url) => {
        if (cancelled) return;
        if (url) setQrCodeUrl(url);
        else setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [binId, locationId]);

  // Keep the screen on while the collector scans; the phone drops the lock
  // when the page is hidden, so take it again on return
  useEffect(() => {
    let lock = null;
    const request = async () => {
      try {
        if (navigator.wakeLock && document.visibilityState === 'visible') {
          lock = await navigator.wakeLock.request('screen');
        }
      } catch (e) {
        // Not supported or refused: the code still shows
      }
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      document.removeEventListener('visibilitychange', request);
      if (lock) lock.release().catch(() => {});
    };
  }, []);

  // Escape closes this view only, not a window behind it
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bin-qr-title"
      className="fixed inset-0 z-[100001] bg-white flex flex-col items-center overflow-y-auto px-6 pt-6 pb-8"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close QR code"
        className="self-end w-11 h-11 rounded-full flex items-center justify-center text-td-ink hover:bg-td-cream"
      >
        <FiX aria-hidden="true" className="w-6 h-6" />
      </button>

      <div className="flex-1 w-full max-w-sm flex flex-col items-center justify-center text-center">
        <h2 id="bin-qr-title" className="text-2xl font-bold text-td-ink">
          {arrived ? 'Your collector is here' : 'Your bin QR code'}
        </h2>
        <p className="mt-2 text-td-sage">Show this code to your collector to scan.</p>

        <div className="mt-6 w-[min(80vw,52vh)] max-w-[360px] aspect-square flex items-center justify-center">
          {qrCodeUrl ? (
            <img
              src={qrCodeUrl}
              alt="Digital bin QR code"
              className="w-full h-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : failed ? (
            <p className="text-sm text-td-error">
              The code couldn't be shown. Open My Digital Bins and try again.
            </p>
          ) : (
            <span className="w-10 h-10 rounded-full border-4 border-td-border border-t-td-forest animate-spin" aria-label="Loading QR code" />
          )}
        </div>

        {locationName && <p className="mt-4 text-sm font-medium text-td-ink">{locationName}</p>}
        <p className="mt-4 text-[13px] text-td-sage">Turn your screen brightness up if the scan is slow.</p>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-6 w-full max-w-sm h-12 rounded-full border-[1.5px] border-td-border-strong text-td-ink text-[15px] font-semibold hover:bg-td-cream"
      >
        Done
      </button>
    </div>
  );
};

export default BinQRFullScreen;
