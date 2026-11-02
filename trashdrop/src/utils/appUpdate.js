/**
 * New app versions.
 *
 * The service worker downloads a release in the background, then waits: the
 * old version keeps running until every tab of the app is closed. Instead,
 * the app shows "New version available" (UpdateBanner) and, on tap, tells the
 * waiting worker to take over (SKIP_WAITING, handled in service-worker.js)
 * and reloads once it has.
 *
 * A version that turns up in the first seconds after the app is opened or
 * brought back to the foreground is switched to without asking: nobody has
 * started filling anything in yet. And when a deploy has removed a code file
 * the running version still asks for, the page reloads once onto the new one.
 */

export const UPDATE_EVENT = 'td-app-update-available';

// An update this soon after opening or resuming the app is applied quietly
export const FRESH_START_MS = 10 * 1000;
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const CHUNK_RELOAD_KEY = 'td-chunk-reload-at';
// A second missing chunk this soon after reloading for one is not retried
const CHUNK_RELOAD_COOLDOWN_MS = 30 * 1000;

let waitingRegistration = null;
let reloading = false;
let startedAt = Date.now();

const reloadOnce = () => {
  if (reloading) return;
  reloading = true;
  window.location.reload();
};

/** A new version is downloaded and waiting (service worker onUpdate callback) */
export const notifyUpdateReady = (registration) => {
  waitingRegistration = registration;
  if (Date.now() - startedAt < FRESH_START_MS) {
    applyUpdate();
    return;
  }
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
};

/** True when a new version is waiting (for a banner that mounts late) */
export const isUpdateReady = () => Boolean(waitingRegistration?.waiting);

/** Switch to the waiting version and reload the page */
export const applyUpdate = () => {
  const waiting = waitingRegistration?.waiting;
  if (!waiting || !('serviceWorker' in navigator)) {
    reloadOnce();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
  waiting.postMessage({ type: 'SKIP_WAITING' });
};

/**
 * After registering: report a version that was already waiting from an
 * earlier visit, and look for a new release whenever the app comes back to
 * the foreground and every half hour (an installed app can stay open for days).
 */
export const watchForUpdates = (registration, onUpdate) => {
  if (registration.waiting && navigator.serviceWorker.controller) {
    onUpdate(registration);
  }
  const checkForUpdate = () => registration.update().catch(() => {}); // offline: try later
  setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      startedAt = Date.now();
      checkForUpdate();
    }
  });
};

/** A code file (chunk) that failed to download, e.g. because a deploy replaced it */
export const isChunkLoadError = (error) => Boolean(error) && (
  error.name === 'ChunkLoadError' ||
  /Loading (CSS )?chunk [\w-]+ failed/i.test(error.message || '')
);

/**
 * Reload onto the current version when a chunk is missing. Returns true when
 * the page is reloading; false for other errors, or when it already reloaded
 * for one moments ago (so a chunk that is really gone can't loop).
 */
export const reloadForMissingChunk = (error) => {
  if (!isChunkLoadError(error)) return false;
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) || 0;
    if (Date.now() - last < CHUNK_RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch (e) {
    // No storage: reload anyway, the loop guard is best effort
  }
  reloadOnce();
  return true;
};

/** Catch missing chunks from dynamic imports outside React (await import(...)) */
export const watchForMissingChunks = () => {
  window.addEventListener('unhandledrejection', (event) => reloadForMissingChunk(event.reason));
  window.addEventListener('error', (event) => reloadForMissingChunk(event.error));
};
