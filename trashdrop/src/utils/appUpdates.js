/**
 * Moves users onto a new deploy without waiting for every tab to close.
 *
 * Workbox normally keeps a new service worker "waiting" until no tab uses the
 * old one, and the app shell is served from the old precache until then, so
 * users stayed on old builds for days after a deploy. Now:
 *
 *   1. A waiting worker is told to take over (SKIP_WAITING), and the service
 *      worker also skips waiting on install by itself.
 *   2. When the new worker takes control (controllerchange), the page reloads
 *      onto the new build if the update landed just after the app was opened
 *      or brought back to the foreground, before anyone could start a form.
 *      Otherwise a "New version available" bar offers a Refresh, so an
 *      in-progress booking is never thrown away.
 *   3. Updates are checked whenever the app comes back to the foreground and
 *      every 30 minutes, not just on a full page load.
 *   4. A lazy chunk that 404s because a deploy replaced it reloads the page
 *      once instead of leaving a broken screen.
 */

// An update this soon after opening or resuming the app reloads on its own
export const FRESH_START_MS = 10 * 1000;
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const CHUNK_RELOAD_KEY = 'trashdrop:chunk-reload-at';
const CHUNK_RELOAD_COOLDOWN_MS = 30 * 1000;
const BANNER_ID = 'trashdrop-update-banner';

/** Ask a waiting service worker to take over now. */
export function activateWaitingWorker(registration) {
  if (registration && registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
}

const isChunkLoadError = (error) => Boolean(error) && (
  error.name === 'ChunkLoadError' ||
  /Loading (CSS )?chunk [\w-]+ failed/i.test(error.message || '')
);

function showUpdateBanner(reload) {
  if (document.getElementById(BANNER_ID)) return;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'status');
  Object.assign(banner.style, {
    position: 'fixed',
    left: '16px',
    right: '16px',
    bottom: '88px', // clear of the bottom navigation bar
    zIndex: '10000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: '8px',
    background: '#166534',
    color: '#ffffff',
    fontSize: '14px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)'
  });

  const text = document.createElement('span');
  text.textContent = 'A new version of TrashDrop is available.';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Refresh';
  Object.assign(button.style, {
    background: '#ffffff',
    color: '#166534',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontWeight: '600',
    cursor: 'pointer'
  });
  button.addEventListener('click', reload);

  banner.append(text, button);
  document.body.appendChild(banner);
}

/**
 * Wire up update handling. Call once, in production, after registering the
 * service worker.
 *
 * @param {Object} [options] - injectable for tests
 * @param {Function} [options.reload] - reloads the page
 * @param {Function} [options.now] - current time in ms
 * @param {Storage} [options.storage] - for the chunk-reload loop guard
 */
export function initAppUpdates({
  reload = () => window.location.reload(),
  now = () => Date.now(),
  storage = window.sessionStorage
} = {}) {
  if (!('serviceWorker' in navigator)) return;

  let freshSince = now();
  let isReloading = false;
  const reloadOnce = () => {
    if (isReloading) return;
    isReloading = true;
    reload();
  };

  // The very first install also claims the page; that is the build already
  // running, so only a change of an existing controller means a new deploy
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (now() - freshSince < FRESH_START_MS) {
      reloadOnce();
    } else {
      showUpdateBanner(reloadOnce);
    }
  });

  navigator.serviceWorker.ready.then((registration) => {
    activateWaitingWorker(registration);

    const checkForUpdate = () => {
      registration.update().catch(() => {}); // offline: try again later
    };
    setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        freshSince = now();
        checkForUpdate();
      }
    });
  });

  const recoverFromMissingChunk = (error) => {
    if (!isChunkLoadError(error)) return;
    try {
      const last = Number(storage.getItem(CHUNK_RELOAD_KEY)) || 0;
      if (now() - last < CHUNK_RELOAD_COOLDOWN_MS) return; // already tried; avoid a loop
      storage.setItem(CHUNK_RELOAD_KEY, String(now()));
    } catch (e) {
      // Storage unavailable: still reload, the cooldown is best effort
    }
    reloadOnce();
  };
  window.addEventListener('unhandledrejection', (event) => recoverFromMissingChunk(event.reason));
  window.addEventListener('error', (event) => recoverFromMissingChunk(event.error));
}

export default { initAppUpdates, activateWaitingWorker };
