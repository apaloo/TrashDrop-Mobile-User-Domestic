import { UPDATE_EVENT, notifyUpdateReady, isUpdateReady, applyUpdate } from '../appUpdate';

describe('new app versions', () => {
  it('announces a downloaded version and asks it to take over on Refresh', () => {
    const shown = jest.fn();
    window.addEventListener(UPDATE_EVENT, shown);
    const waiting = { postMessage: jest.fn() };
    const listeners = {};
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { addEventListener: (type, fn) => { listeners[type] = fn; } },
    });

    notifyUpdateReady({ waiting });
    expect(shown).toHaveBeenCalledTimes(1);
    expect(isUpdateReady()).toBe(true);

    applyUpdate();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(listeners.controllerchange).toEqual(expect.any(Function));
  });
});
