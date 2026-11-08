import React, { useEffect, useState } from 'react';
import { useLocationStatus } from '../hooks/useLocationStatus.js';

const isIPhone = () => /iPhone|iPad|iPod/.test(navigator.userAgent || '');

const turnOnHelp = () => (isIPhone()
  ? 'Open Settings, then Privacy & Security, then Location Services, and turn it on.'
  : 'Swipe down from the top of your screen and tap Location.');

// A site that's been blocked can't ask again: only the person can undo it
const allowSteps = () => (isIPhone()
  ? [
    'Open Settings, then Privacy & Security, then Location Services.',
    'Tap Safari Websites and choose While Using the App.',
    'Come back to TrashDrop.',
  ]
  : [
    'Open Chrome and tap the three dots at the top right.',
    'Tap Settings, then Site settings, then Location.',
    `Under Blocked, tap ${window.location.hostname} and choose Allow.`,
    'Come back to TrashDrop.',
  ]);

/**
 * One tap to turn location on, in the style of Uber's banner, above the
 * bottom bar on phones. It clears by itself as soon as location works.
 */
const LocationOffBanner = () => {
  const { problem, checking, tappedAndStillOff, turnOn } = useLocationStatus();
  const [offline, setOffline] = useState(() => navigator.onLine === false);
  const [showAllowSteps, setShowAllowSteps] = useState(false);

  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (!showAllowSteps) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setShowAllowSteps(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAllowSteps]);

  if (!problem) return null;

  const handleTap = () => {
    if (problem === 'blocked') setShowAllowSteps(true);
    turnOn();
  };

  const title = problem === 'blocked'
    ? 'Location is blocked. Tap to allow'
    : 'Location is off. Tap to turn on';

  return (
    <div
      // Sits above the "Offline" pill when both are showing
      className={`fixed inset-x-3 z-[60] xl:hidden ${offline ? 'bottom-[calc(7.5rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]'}`}
    >
      <button
        type="button"
        onClick={handleTap}
        disabled={checking}
        className="w-full whitespace-normal rounded-2xl bg-amber-400 px-4 py-3 text-left text-gray-900 shadow-lg transition active:scale-[0.99]"
      >
        <span className="flex items-center gap-3">
          <svg className="h-6 w-6 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21s-7-6.1-7-11.5A7 7 0 0119 9.5C19 14.9 12 21 12 21z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          <span className="flex-1 text-[15px] font-semibold">{checking ? 'Checking your location…' : title}</span>
          {!checking && <span className="text-xl leading-none" aria-hidden="true">›</span>}
        </span>
        {problem === 'off' && tappedAndStillOff && !checking && (
          <span className="mt-1 block pl-9 text-[13px]">{turnOnHelp()}</span>
        )}
      </button>

      {problem === 'blocked' && showAllowSteps && (
        <div className="fixed inset-0 z-[99999] flex items-end justify-center">
          <button type="button" aria-label="Close" tabIndex={-1} onClick={() => setShowAllowSteps(false)} className="absolute inset-0 bg-black/50" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="allow-location-title"
            className="relative w-full max-w-md rounded-t-3xl bg-white px-5 pt-5 dark:bg-gray-800"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            <h2 id="allow-location-title" className="text-xl font-bold text-td-ink dark:text-gray-100">Allow location for TrashDrop</h2>
            <p className="mt-1 text-[15px] text-td-sage dark:text-gray-300">Your browser blocked it, so it can only be turned back on in settings.</p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] text-td-ink dark:text-gray-100">
              {allowSteps().map((step) => <li key={step}>{step}</li>)}
            </ol>
            <p className="mt-3 text-sm text-td-sage dark:text-gray-300">This message goes away by itself once location is allowed.</p>
            <button
              type="button"
              autoFocus
              onClick={() => setShowAllowSteps(false)}
              className="mt-4 h-12 w-full rounded-full bg-td-forest text-[16px] font-bold text-white"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationOffBanner;
