import { initAppUpdates, FRESH_START_MS } from '../appUpdates.js';

// A stand-in for navigator.serviceWorker: an event target with a controller and
// a ready registration whose waiting worker records the messages it receives
const installServiceWorker = ({ hasController = true } = {}) => {
  const messages = [];
  const updateChecks = [];
  const container = new EventTarget();
  container.controller = hasController ? {} : null;
  container.ready = Promise.resolve({
    waiting: { postMessage: (message) => messages.push(message) },
    update: () => { updateChecks.push(true); return Promise.resolve(); }
  });
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
  return { container, messages, updateChecks };
};

const memoryStorage = () => {
  const values = {};
  return { getItem: (k) => values[k] ?? null, setItem: (k, v) => { values[k] = v; } };
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const banner = () => document.getElementById('trashdrop-update-banner');

let clock;
const now = () => clock;

beforeEach(() => {
  clock = 1_000_000;
  document.body.innerHTML = '';
});

describe('initAppUpdates', () => {
  it('tells a waiting service worker to take over', async () => {
    const { messages } = installServiceWorker();
    initAppUpdates({ reload: jest.fn(), now, storage: memoryStorage() });
    await flush();

    expect(messages).toEqual([{ type: 'SKIP_WAITING' }]);
  });

  it('reloads onto the new build when it lands just after the app opened', () => {
    const { container } = installServiceWorker();
    const reload = jest.fn();
    initAppUpdates({ reload, now, storage: memoryStorage() });

    clock += FRESH_START_MS - 1000;
    container.dispatchEvent(new Event('controllerchange'));

    expect(reload).toHaveBeenCalledTimes(1);
    expect(banner()).toBeNull();
  });

  it('offers a Refresh instead of reloading once the user may be mid-task', () => {
    const { container } = installServiceWorker();
    const reload = jest.fn();
    initAppUpdates({ reload, now, storage: memoryStorage() });

    clock += FRESH_START_MS + 60_000;
    container.dispatchEvent(new Event('controllerchange'));

    expect(reload).not.toHaveBeenCalled();
    expect(banner()).toHaveTextContent('A new version of TrashDrop is available.');

    banner().querySelector('button').click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the first-ever install claims the page', () => {
    const { container } = installServiceWorker({ hasController: false });
    const reload = jest.fn();
    initAppUpdates({ reload, now, storage: memoryStorage() });

    container.dispatchEvent(new Event('controllerchange'));

    expect(reload).not.toHaveBeenCalled();
    expect(banner()).toBeNull();
  });

  it('checks for an update on resume, and treats the resume as a fresh start', async () => {
    const { container, updateChecks } = installServiceWorker();
    const reload = jest.fn();
    initAppUpdates({ reload, now, storage: memoryStorage() });
    await flush();

    clock += 3_600_000; // an hour in the background
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(updateChecks.length).toBeGreaterThan(0);

    clock += 2000;
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads once when a chunk from the previous deploy is gone, without looping', () => {
    installServiceWorker();
    const storage = memoryStorage();

    const firstReload = jest.fn();
    initAppUpdates({ reload: firstReload, now, storage });
    const chunkError = Object.assign(new Error('Loading chunk 271 failed.'), { name: 'ChunkLoadError' });
    const rejection = new Event('unhandledrejection');
    rejection.reason = chunkError;
    window.dispatchEvent(rejection);
    expect(firstReload).toHaveBeenCalledTimes(1);

    // The reloaded page hits the same error straight away: no second reload
    const secondReload = jest.fn();
    clock += 5000;
    initAppUpdates({ reload: secondReload, now, storage });
    window.dispatchEvent(rejection);
    expect(secondReload).not.toHaveBeenCalled();
  });
});
