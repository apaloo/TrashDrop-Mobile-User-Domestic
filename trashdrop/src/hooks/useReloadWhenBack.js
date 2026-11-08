import { useEffect, useRef } from 'react';

const FIRST_RETRY_MS = 30000;
const LONGEST_WAIT_MS = 5 * 60 * 1000;

/**
 * Background retry for a screen whose data couldn't load, so nobody has to
 * press a button. While `waiting` is true it reloads when the phone comes
 * back online, and on a timer that starts at 30 seconds and doubles up to 5
 * minutes, so a struggling server isn't hammered.
 */
export const useReloadWhenBack = (waiting, reload) => {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!waiting) return undefined;
    let wait = FIRST_RETRY_MS;
    let timer;
    const schedule = () => {
      timer = setTimeout(() => {
        if (navigator.onLine !== false) reloadRef.current();
        wait = Math.min(wait * 2, LONGEST_WAIT_MS);
        schedule();
      }, wait);
    };
    const onOnline = () => {
      wait = FIRST_RETRY_MS;
      clearTimeout(timer);
      schedule();
      reloadRef.current();
    };
    schedule();
    window.addEventListener('online', onOnline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [waiting]);
};

export default useReloadWhenBack;
