import { createContext, useContext } from 'react';

/**
 * The bin QR code on arrival (see ArrivalQRContext.js for the provider).
 * Kept apart from the provider so screens using it don't load Supabase; with
 * no provider above them every action does nothing.
 *
 * - arrivedBin: the bin the collector is standing at, or null
 * - showBinQR(bin, { arrived }): open a bin's code full screen
 * - autoShowBinQR(bin): open it by itself, once per arrival
 * - prepareBinQR(bin): make and keep the code ahead of time, for no signal
 */
const noop = () => {};
export const ArrivalQRContext = createContext({
  arrivedBin: null,
  showBinQR: noop,
  autoShowBinQR: noop,
  prepareBinQR: noop,
});

export const useArrivalQR = () => useContext(ArrivalQRContext);
