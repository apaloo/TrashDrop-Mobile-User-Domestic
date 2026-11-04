import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext.js';
import supabase from '../utils/supabaseClient.js';
import BinQRFullScreen, { ensureBinQR } from '../components/digitalBin/BinQRFullScreen.js';
import { ArrivalQRContext } from './useArrivalQR.js';

/**
 * When a collector reaches a digital bin, the household needs the bin's QR
 * code at once. This watches the user's bins for the collector's 'arrived'
 * status (set by the collectors app), opens the code full screen by itself
 * once per arrival, and lets any screen open it with showBinQR.
 *
 * It only reads statuses: what the collector's scan does is unchanged.
 */

// Statuses after the scan: the code has done its job. ('collecting' is left
// out: the code stays up until the collector moves the bin on.)
const PAST_ARRIVAL = ['picked_up', 'collected', 'completed', 'disposed', 'cancelled'];
// Opened by itself once per arrival; a fresh arrival after this long opens again
const AUTO_OPEN_KEY = (binId) => `td_arrival_qr_${binId}`;
const AUTO_OPEN_WINDOW_MS = 6 * 60 * 60 * 1000;

export { useArrivalQR } from './useArrivalQR.js';

const readStorage = (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } };
const writeStorage = (key, value) => { try { localStorage.setItem(key, value); } catch (e) { /* private mode */ } };
const removeStorage = (key) => { try { localStorage.removeItem(key); } catch (e) { /* private mode */ } };

const recentlyAutoOpened = (binId) => {
  const at = Number(readStorage(AUTO_OPEN_KEY(binId)));
  return Boolean(at) && Date.now() - at < AUTO_OPEN_WINDOW_MS;
};

const toBin = (row) => row && ({
  id: row.id,
  location_id: row.location_id || null,
  location_name: row.location_name || row.bin_locations?.location_name || '',
});

export const ArrivalQRProvider = ({ children }) => {
  const { user } = useAuth();
  // The bin the collector is standing at, if any
  const [arrivedBin, setArrivedBin] = useState(null);
  // The code on screen: { bin, arrived }
  const [open, setOpen] = useState(null);
  const openRef = useRef(open);
  openRef.current = open;

  const showBinQR = useCallback((bin, { arrived = false } = {}) => {
    if (bin?.id) setOpen({ bin: toBin(bin), arrived });
  }, []);

  // Open by itself, but only the first time for this arrival
  const autoShowBinQR = useCallback((bin) => {
    if (!bin?.id || recentlyAutoOpened(bin.id)) return;
    writeStorage(AUTO_OPEN_KEY(bin.id), String(Date.now()));
    setOpen({ bin: toBin(bin), arrived: true });
  }, []);

  const close = useCallback(() => setOpen(null), []);

  // Make the code now, so it shows at the gate even without signal
  const prepareBinQR = useCallback((bin) => {
    if (bin?.id) ensureBinQR(bin.id, bin.location_id || null).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setArrivedBin(null);
      setOpen(null);
      return undefined;
    }
    let cancelled = false;

    const arrive = (bin) => {
      setArrivedBin(bin);
      autoShowBinQR(bin);
    };

    // Already arrived when the app opens (or when it reconnects)
    const check = async () => {
      const { data } = await supabase
        .from('digital_bins')
        .select('id, location_id, status, bin_locations:location_id (location_name)')
        .eq('user_id', user.id)
        .eq('status', 'arrived')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      const bin = toBin(data?.[0]);
      if (bin) arrive(bin);
      else setArrivedBin(null);
    };
    check().catch(() => {});
    window.addEventListener('online', check);

    // Its own channel: the shared helper in utils/realtime.js hands later
    // callers the first caller's channel, so they would never hear updates
    const channel = supabase
      .channel(`arrival_qr_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'digital_bins', filter: `user_id=eq.${user.id}` },
        ({ new: row }) => {
          if (!row?.id) return;
          if (row.status === 'arrived') {
            const bin = toBin(row);
            arrive(bin);
            // The update carries no place name: fetch it for the screen
            if (row.location_id) {
              supabase.from('bin_locations').select('location_name').eq('id', row.location_id).maybeSingle()
                .then(({ data }) => {
                  if (cancelled || !data?.location_name) return;
                  const named = { ...bin, location_name: data.location_name };
                  setArrivedBin((current) => (current?.id === bin.id ? named : current));
                  setOpen((current) => (current?.bin.id === bin.id ? { ...current, bin: named } : current));
                })
                .catch(() => {});
            }
          } else {
            setArrivedBin((current) => (current?.id === row.id ? null : current));
            if (PAST_ARRIVAL.includes(row.status)) {
              // Scanned: put the code away, and let the next arrival open it again
              removeStorage(AUTO_OPEN_KEY(row.id));
              if (openRef.current?.bin.id === row.id) setOpen(null);
            }
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.removeEventListener('online', check);
      supabase.removeChannel(channel);
    };
  }, [user?.id, autoShowBinQR]);

  const value = useMemo(
    () => ({ arrivedBin, showBinQR, autoShowBinQR, prepareBinQR }),
    [arrivedBin, showBinQR, autoShowBinQR, prepareBinQR]
  );

  return (
    <ArrivalQRContext.Provider value={value}>
      {children}
      {open && (
        <BinQRFullScreen
          binId={open.bin.id}
          locationId={open.bin.location_id}
          locationName={open.bin.location_name}
          arrived={open.arrived || arrivedBin?.id === open.bin.id}
          onClose={close}
        />
      )}
    </ArrivalQRContext.Provider>
  );
};

