import React, { useState, useEffect, useRef } from 'react';
import { FiWifiOff, FiCheck } from 'react-icons/fi';

/**
 * The one place the app mentions the connection: a small pill above the
 * bottom bar, like phone apps do. Pages keep showing what they already have
 * and refresh by themselves when the connection is back, so they say nothing
 * about being offline themselves.
 *
 * Offline: "Offline · showing saved info", until the connection is back.
 * Back online: "Back online" for two seconds.
 * It never covers the top bar and never moves the page.
 */
const NetworkStatusRibbon = () => {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [justReconnected, setJustReconnected] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setJustReconnected(false), 2000);
    };
    const handleOffline = () => {
      clearTimeout(timerRef.current);
      setJustReconnected(false);
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !justReconnected) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] xl:bottom-6 z-[60] flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div className="inline-flex items-center gap-2 rounded-full bg-td-ink/90 dark:bg-gray-700/95 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm">
        {isOnline ? (
          <>
            <FiCheck aria-hidden="true" className="h-4 w-4 text-td-lime" />
            Back online
          </>
        ) : (
          <>
            <FiWifiOff aria-hidden="true" className="h-4 w-4 text-td-lime" />
            Offline · showing saved info
          </>
        )}
      </div>
    </div>
  );
};

export default NetworkStatusRibbon;
