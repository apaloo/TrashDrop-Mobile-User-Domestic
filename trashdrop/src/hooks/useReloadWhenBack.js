import { useEffect, useRef } from 'react';

const RETRY_MS = 30000;

/**
 * While a screen is waiting for a connection: reload when the phone comes
 * back online, and every 30 seconds in case it says it's online on a weak
 * signal. The person doesn't have to do anything.
 */
export const useReloadWhenBack = (waiting, reload) => {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!waiting) return undefined;
    const run = () => reloadRef.current();
    const timer = setInterval(() => {
      if (navigator.onLine !== false) run();
    }, RETRY_MS);
    window.addEventListener('online', run);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', run);
    };
  }, [waiting]);
};

export default useReloadWhenBack;
