import React, { useEffect, useState } from 'react';
import { UPDATE_EVENT, applyUpdate, isUpdateReady } from '../utils/appUpdate.js';

/**
 * "New version available" bar, shown when a new release has downloaded.
 * Refresh switches to it now; Later hides the bar (the new version then starts
 * the next time the app is opened).
 * Sits above the phone's bottom navigation bar and any pop-up (the install
 * prompt covers the screen), so Refresh can always be tapped.
 */
const UpdateBanner = () => {
  const [visible, setVisible] = useState(isUpdateReady);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const show = () => setVisible(true);
    window.addEventListener(UPDATE_EVENT, show);
    return () => window.removeEventListener(UPDATE_EVENT, show);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed left-4 right-4 bottom-20 md:bottom-6 md:left-auto md:right-6 md:w-96 z-[10000] flex items-center gap-3 rounded-xl bg-td-ink text-white shadow-lg px-4 py-3"
    >
      <p className="flex-1 text-sm font-medium">New version available</p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="text-sm text-gray-300 hover:text-white px-2 py-1"
      >
        Later
      </button>
      <button
        type="button"
        disabled={refreshing}
        onClick={() => { setRefreshing(true); applyUpdate(); }}
        className="text-sm font-semibold rounded-lg bg-td-lime text-td-ink px-3 py-1.5 hover:brightness-95 disabled:opacity-70"
      >
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
};

export default UpdateBanner;
