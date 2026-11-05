import React, { useCallback, useEffect, useRef, useState } from 'react';
import { describeLocationProblem, readLocationPermission } from '../../utils/locationProblem.js';
import { errorNote, primaryButton, secondaryButton } from './styles.js';

/** Problems that need the user to switch something on (not a slow fix) */
export const needsLocationTurnedOn = (problem) => !!problem && ['device-off', 'blocked'].includes(problem.kind);

/**
 * Blocks a screen until the phone's location is on. A location request made
 * straight from a tap lets Android Chrome show its own "Turn on location?"
 * dialog, which a request made on page load cannot.
 */
export const LocationRequiredModal = ({
  problem,
  requesting,
  failedTries = 0,
  onTurnOn,
  onReload,
  onLeave,
  leaveLabel = 'Back to Dashboard',
  action = 'report',
  reason = 'We need the exact spot of the dumping so the cleanup team can find it.',
}) => {
  const blocked = problem.kind === 'blocked';
  return (
    <div className="fixed inset-0 z-[99999] overflow-y-auto">
      <div className="fixed inset-0 bg-black/60" aria-hidden="true"></div>
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="location-required-title"
          aria-describedby="location-required-text"
          className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-sm w-full px-6 pt-7 pb-6 text-center"
        >
          <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-2xl bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 mb-4" aria-hidden="true">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M12 21s-7-6.1-7-11.5A7 7 0 0119 9.5C19 14.9 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
            </svg>
          </div>
          <h2 id="location-required-title" className="text-[20px] font-bold text-td-ink dark:text-gray-100">
            {blocked ? `Allow location to ${action}` : `Turn on location to ${action}`}
          </h2>
          <div id="location-required-text" className="text-[15px] text-td-sage dark:text-gray-300 mt-2 space-y-2">
            <p>{reason}</p>
            {blocked ? (
              <ol className="list-decimal pl-5 text-left text-sm space-y-1">
                {problem.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            ) : (
              <p className="text-sm">Tap the button and choose <span className="font-semibold">Turn on</span> when your phone asks. If nothing appears, swipe down from the top of the screen and tap Location.</p>
            )}
          </div>
          {failedTries > 0 && !requesting && (
            <div className={`${errorNote} px-4 py-3 mt-4 text-left text-sm`} role="alert" data-testid="location-still-off">
              <p className="font-semibold">
                {blocked ? 'Location is still blocked for TrashDrop.' : "We still can't get your location."}
                {failedTries > 1 ? ` (tried ${failedTries} times)` : ''}
              </p>
              <p className="mt-1">
                {blocked
                  ? 'Check each place in the list above. If you have just changed a setting, reload the page.'
                  : "Check that Location is on in your phone's quick settings, then try again."}
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-2.5 mt-5">
            <button type="button" autoFocus onClick={onTurnOn} disabled={requesting} className={primaryButton}>
              {requesting ? 'Checking your location...' : blocked ? 'I have allowed it - try again' : 'Turn on location'}
            </button>
            {failedTries > 0 && onReload && (
              <button type="button" onClick={onReload} className={secondaryButton}>
                Reload page
              </button>
            )}
            {onLeave && (
              <button type="button" onClick={onLeave} className={secondaryButton}>
                {leaveLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };

/**
 * State and actions behind LocationRequiredModal, for screens that ask for
 * the location themselves:
 *   reportFailure(geoError)  after their own request failed
 *   requestFromTap(onFix)    from a button tap; calls onFix(coords) on success
 * While a problem is showing it tries again on its own when the user comes
 * back to the app or the browser permission changes.
 */
export const useLocationRequired = () => {
  const [problem, setProblem] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [failedTries, setFailedTries] = useState(0);
  const onFixRef = useRef(null);
  const problemRef = useRef(null);
  problemRef.current = problem;

  const reportFailure = useCallback(async (geoError) => {
    const permission = geoError ? await readLocationPermission() : 'unknown';
    setProblem(describeLocationProblem(geoError, permission));
  }, []);

  const clear = useCallback(() => {
    setProblem(null);
    setFailedTries(0);
    setRequesting(false);
  }, []);

  const request = useCallback((onFix, { fromTap = true } = {}) => {
    if (onFix) onFixRef.current = onFix;
    if (!navigator.geolocation?.getCurrentPosition) {
      reportFailure(null);
      return;
    }
    if (fromTap) setRequesting(true);
    const startedAt = Date.now();
    // A blocked browser refuses at once; keep "Checking..." up briefly so the
    // tap visibly did something before the result shows
    const settle = (fn) => setTimeout(fn, Math.max(0, (fromTap ? 800 : 0) - (Date.now() - startedAt)));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setProblem(null);
        setFailedTries(0);
        setRequesting(false);
        onFixRef.current?.({ latitude, longitude, accuracy });
      },
      (geoError) => settle(async () => {
        await reportFailure(geoError);
        if (fromTap) setFailedTries((n) => n + 1);
        setRequesting(false);
      }),
      GEO_OPTIONS
    );
  }, [reportFailure]);

  const requestFromTap = useCallback((onFix) => request(onFix, { fromTap: true }), [request]);

  // Came back after switching location on: try again without a tap
  useEffect(() => {
    const retry = () => {
      if (document.visibilityState === 'visible' && needsLocationTurnedOn(problemRef.current) && onFixRef.current) {
        request(null, { fromTap: false });
      }
    };
    document.addEventListener('visibilitychange', retry);
    window.addEventListener('focus', retry);
    let status = null;
    Promise.resolve()
      .then(() => navigator.permissions?.query?.({ name: 'geolocation' }))
      .then((s) => { status = s; if (s) s.onchange = retry; })
      .catch(() => {});
    return () => {
      document.removeEventListener('visibilitychange', retry);
      window.removeEventListener('focus', retry);
      if (status) status.onchange = null;
    };
  }, [request]);

  return { problem, requesting, failedTries, reportFailure, requestFromTap, clear, setOnFix: (fn) => { onFixRef.current = fn; } };
};
