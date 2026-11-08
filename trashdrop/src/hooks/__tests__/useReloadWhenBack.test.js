import { renderHook, act } from '@testing-library/react';
import { useReloadWhenBack } from '../useReloadWhenBack.js';

const MIN = 60000;
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('useReloadWhenBack', () => {
  it('retries after 30s, then 1, 2, 4 and at most 5 minutes apart', () => {
    const reload = jest.fn();
    renderHook(() => useReloadWhenBack(true, reload));

    jest.advanceTimersByTime(29999);
    expect(reload).toHaveBeenCalledTimes(0);
    jest.advanceTimersByTime(1);
    expect(reload).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1 * MIN);
    expect(reload).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(2 * MIN);
    expect(reload).toHaveBeenCalledTimes(3);
    jest.advanceTimersByTime(4 * MIN);
    expect(reload).toHaveBeenCalledTimes(4);
    jest.advanceTimersByTime(5 * MIN);
    expect(reload).toHaveBeenCalledTimes(5);
    jest.advanceTimersByTime(5 * MIN);
    expect(reload).toHaveBeenCalledTimes(6);
  });

  it('reloads at once when the phone comes back online', () => {
    const reload = jest.fn();
    renderHook(() => useReloadWhenBack(true, reload));
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('stops once the data has loaded, and does nothing when not waiting', () => {
    const reload = jest.fn();
    const { rerender } = renderHook(({ waiting }) => useReloadWhenBack(waiting, reload), { initialProps: { waiting: true } });
    rerender({ waiting: false });
    jest.advanceTimersByTime(10 * MIN);
    window.dispatchEvent(new Event('online'));
    expect(reload).not.toHaveBeenCalled();
  });
});
