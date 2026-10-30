/**
 * New app versions.
 *
 * The service worker downloads a release in the background, then waits: the
 * old version keeps running until every tab of the app is closed. Instead,
 * the app shows "New version available" (UpdateBanner) and, on tap, tells the
 * waiting worker to take over (SKIP_WAITING, handled in service-worker.js)
 * and reloads once it has.
 */

export const UPDATE_EVENT = 'td-app-update-available';

let waitingRegistration = null;
let reloading = false;

/** A new version is downloaded and waiting (service worker onUpdate callback) */
export const notifyUpdateReady = (registration) => {
  waitingRegistration = registration;
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
};

/** True when a new version is waiting (for a banner that mounts late) */
export const isUpdateReady = () => Boolean(waitingRegistration?.waiting);

/** Switch to the waiting version and reload the page */
export const applyUpdate = () => {
  const waiting = waitingRegistration?.waiting;
  if (!waiting || !('serviceWorker' in navigator)) {
    window.location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  waiting.postMessage({ type: 'SKIP_WAITING' });
};

/**
 * After registering: report a version that was already waiting from an
 * earlier visit, and look for a new release whenever the app comes back to
 * the foreground (an installed app can stay open for days).
 */
export const watchForUpdates = (registration, onUpdate) => {
  if (registration.waiting && navigator.serviceWorker.controller) {
    onUpdate(registration);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      registration.update().catch(() => {});
    }
  });
};
