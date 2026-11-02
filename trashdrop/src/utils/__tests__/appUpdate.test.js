import { UPDATE_CHECK_INTERVAL_MS, IDLE_MS } from '../appUpdate';

// The module keeps state (when the app started, whether it is reloading), so
// each test gets a fresh copy
const loadAppUpdate = () => {
  let mod;
  jest.isolateModules(() => { mod = require('../appUpdate'); });
  return mod;
};

// Listeners added by earlier tests stay on document, and CRA resets jest.fn
// implementations between tests, so the registration's update is a plain stub
const fakeRegistration = () => {
  const registration = { checks: 0 };
  registration.update = () => { registration.checks += 1; return Promise.resolve(); };
  return registration;
};

const fakeServiceWorker = () => {
  const listeners = {};
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { controller: {}, addEventListener: (type, fn) => { listeners[type] = fn; } },
  });
  return listeners;
};

describe('new app versions', () => {
  const realLocation = window.location;
  let reload;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-02T09:00:00Z'));
    reload = jest.fn();
    delete window.location;
    window.location = { reload };
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    window.location = realLocation;
  });

  it('announces a version that arrives later and asks it to take over on Refresh', () => {
    const { UPDATE_EVENT, notifyUpdateReady, isUpdateReady, applyUpdate } = loadAppUpdate();
    const listeners = fakeServiceWorker();
    const shown = jest.fn();
    window.addEventListener(UPDATE_EVENT, shown);
    const waiting = { postMessage: jest.fn() };

    jest.advanceTimersByTime(60 * 1000);
    notifyUpdateReady({ waiting });
    expect(shown).toHaveBeenCalledTimes(1);
    expect(waiting.postMessage).not.toHaveBeenCalled();
    expect(isUpdateReady()).toBe(true);

    applyUpdate();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    listeners.controllerchange();
    expect(reload).toHaveBeenCalledTimes(1);
    window.removeEventListener(UPDATE_EVENT, shown);
  });

  it('switches without asking when the version arrives just after opening', () => {
    const { UPDATE_EVENT, notifyUpdateReady } = loadAppUpdate();
    const listeners = fakeServiceWorker();
    const shown = jest.fn();
    window.addEventListener(UPDATE_EVENT, shown);
    const waiting = { postMessage: jest.fn() };

    jest.advanceTimersByTime(3 * 1000);
    notifyUpdateReady({ waiting });
    expect(shown).not.toHaveBeenCalled();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    listeners.controllerchange();
    expect(reload).toHaveBeenCalledTimes(1);
    window.removeEventListener(UPDATE_EVENT, shown);
  });

  it('checks for a new version every half hour and on returning to the app', () => {
    const { watchForUpdates } = loadAppUpdate();
    fakeServiceWorker();
    const registration = fakeRegistration();

    watchForUpdates(registration, jest.fn());
    expect(registration.checks).toBe(0);
    jest.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(registration.checks).toBe(1);

    document.dispatchEvent(new Event('visibilitychange'));
    expect(registration.checks).toBe(2);
  });

  it('treats returning to the app as a fresh start', () => {
    const { UPDATE_EVENT, notifyUpdateReady, watchForUpdates } = loadAppUpdate();
    fakeServiceWorker();
    const shown = jest.fn();
    window.addEventListener(UPDATE_EVENT, shown);
    watchForUpdates(fakeRegistration(), jest.fn());
    const waiting = { postMessage: jest.fn() };

    jest.advanceTimersByTime(2 * 60 * 60 * 1000);
    document.dispatchEvent(new Event('visibilitychange'));
    jest.advanceTimersByTime(2 * 1000);
    notifyUpdateReady({ waiting });
    expect(shown).not.toHaveBeenCalled();
    expect(waiting.postMessage).toHaveBeenCalled();
    window.removeEventListener(UPDATE_EVENT, shown);
  });

  it('on returning to the app, switches to a version that downloaded in the background', () => {
    const { watchForUpdates, notifyUpdateReady } = loadAppUpdate();
    fakeServiceWorker();
    const registration = fakeRegistration();
    watchForUpdates(registration, notifyUpdateReady);

    // Downloaded while the app sat in the background
    jest.advanceTimersByTime(3 * 60 * 60 * 1000);
    registration.waiting = { postMessage: jest.fn() };
    const checksBefore = registration.checks;
    document.dispatchEvent(new Event('visibilitychange'));

    expect(registration.waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(registration.checks).toBe(checksBefore); // no need to look again
  });

  it('switches without asking when the app has sat idle, but not over a half-filled form', () => {
    const { UPDATE_EVENT, notifyUpdateReady, watchForUpdates, markScreenChanged } = loadAppUpdate();
    fakeServiceWorker();
    const shown = jest.fn();
    window.addEventListener(UPDATE_EVENT, shown);
    watchForUpdates(fakeRegistration(), jest.fn());

    // Left open on screen, untouched
    jest.advanceTimersByTime(IDLE_MS + 1000);
    const idleWaiting = { postMessage: jest.fn() };
    notifyUpdateReady({ waiting: idleWaiting });
    expect(idleWaiting.postMessage).toHaveBeenCalled();
    expect(shown).not.toHaveBeenCalled();

    // Typed into a field, then left: ask instead of reloading under them
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    jest.advanceTimersByTime(IDLE_MS + 1000);
    const formWaiting = { postMessage: jest.fn() };
    notifyUpdateReady({ waiting: formWaiting });
    expect(formWaiting.postMessage).not.toHaveBeenCalled();
    expect(shown).toHaveBeenCalledTimes(1);

    // Moved to another screen: quiet again
    markScreenChanged();
    notifyUpdateReady({ waiting: formWaiting });
    expect(formWaiting.postMessage).toHaveBeenCalled();
    field.remove();
    window.removeEventListener(UPDATE_EVENT, shown);
  });

  it('reloads once for a missing chunk, and not again straight after', () => {
    const chunkError = Object.assign(new Error('Loading chunk 42 failed.'), { name: 'ChunkLoadError' });

    expect(loadAppUpdate().reloadForMissingChunk(chunkError)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    // The reloaded page hits the same missing file: show the error instead of looping
    jest.advanceTimersByTime(5 * 1000);
    expect(loadAppUpdate().reloadForMissingChunk(chunkError)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(60 * 1000);
    expect(loadAppUpdate().reloadForMissingChunk(chunkError)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('leaves other errors alone', () => {
    const { reloadForMissingChunk, isChunkLoadError } = loadAppUpdate();
    expect(isChunkLoadError(new Error('Loading CSS chunk 7 failed.'))).toBe(true);
    expect(reloadForMissingChunk(new TypeError('x is undefined'))).toBe(false);
    expect(reloadForMissingChunk(undefined)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
