/**
 * New app versions.
 *
 * The service worker downloads a release in the background, then waits: the
 * old version keeps running until every tab of the app is closed. Instead,
 * the app shows "New version available" (UpdateBanner) and, on tap, tells the
 * waiting worker to take over (SKIP_WAITING, handled in service-worker.js)
 * and reloads once it has.
 *
 * The switch happens without asking when nobody is using a form: in the
 * first seconds after the app is opened or brought back to the foreground,
 * while it is in the background, or after it has sat idle - as long as
 * nothing has been typed or picked on the current screen. A version that
 * downloaded while the app was in the background is applied on return, so an
 * app left idle comes back on the current version. And when a deploy has
 * removed a code file the running version still asks for, the page reloads
 * once onto the new one.
 */

export const UPDATE_EVENT = 'td-app-update-available';

// An update this soon after opening or resuming the app is applied quietly
// (downloading a release on a phone connection can take a while)
export const FRESH_START_MS = 30 * 1000;
// ...and so is one that arrives when nobody has touched the app for this long
export const IDLE_MS = 2 * 60 * 1000;
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const CHUNK_RELOAD_KEY = 'td-chunk-reload-at';
// A second missing chunk this soon after reloading for one is not retried
const CHUNK_RELOAD_COOLDOWN_MS = 30 * 1000;

let waitingRegistration = null;
let reloading = false;
let startedAt = Date.now();
let lastInteractionAt = Date.now();
// Something was typed or picked on this screen: reloading would lose it
let formTouched = false;

const reloadOnce = () => {
  if (reloading) return;
  reloading = true;
  window.location.reload();
};

const canSwitchQuietly = () => {
  if (formTouched) return false;
  const now = Date.now();
  return document.visibilityState === 'hidden' ||
    now - startedAt < FRESH_START_MS ||
    now - lastInteractionAt >= IDLE_MS;
};

/** A new version is downloaded and waiting (service worker onUpdate callback) */
export const notifyUpdateReady = (registration) => {
  waitingRegistration = registration;
  if (canSwitchQuietly()) {
    applyUpdate();
    return;
  }
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
};

/** A new screen: whatever was typed on the last one is gone anyway */
export const markScreenChanged = () => {
  formTouched = false;
};

const noteInteraction = (event) => {
  lastInteractionAt = Date.now();
  const target = event.target;
  if (event.type === 'input' || event.type === 'change' ||
      (target && target.closest && target.closest('[aria-pressed], input, select, textarea'))) {
    formTouched = true;
  }
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
 * Coming back with a version that downloaded in the meantime switches to it.
 */
export const watchForUpdates = (registration, onUpdate) => {
  const hasWaiting = () => Boolean(registration.waiting && navigator.serviceWorker.controller);
  if (hasWaiting()) {
    onUpdate(registration);
  }
  ['pointerdown', 'keydown', 'input', 'change'].forEach((type) => {
    document.addEventListener(type, noteInteraction, true);
  });
  const checkForUpdate = () => {
    if (hasWaiting()) {
      onUpdate(registration);
      return;
    }
    registration.update().catch(() => {}); // offline: try later
  };
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
