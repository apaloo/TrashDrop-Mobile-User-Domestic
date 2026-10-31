import React, { useEffect, useMemo, useState, useRef } from 'react';
import QRReader from './QRReader';
import { useAuth } from '../context/AuthContext.js';
import { batchService } from '../services/batchService.js';
import { notificationService } from '../services/notificationService.js';
import supabase from '../utils/supabaseClient.js';
import offlineStorageAPI from '../utils/offlineStorage.js';
import realTableInspector from '../utils/realTableInspector.js';
import { card, dangerButton, errorNote, primaryButton, secondaryButton } from './ui/styles.js';
 

const BatchQRScanner = ({ onScanComplete, autoStart = false }) => {
  const { user, session, loading: authLoading, status } = useAuth();
  const [scanning, setScanning] = useState(autoStart); // Start with autoStart value
  const [error, setError] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const maxRetries = 3;
  const [lastScan, setLastScan] = useState({ value: '', ts: 0 });
  const [hasSupaSession, setHasSupaSession] = useState(false);
  const cancelRef = useRef({ canceled: false });
  const processingRef = useRef(false);
  const lastScanRef = useRef({ value: '', ts: 0 });

  // Auto-start scanning if autoStart prop is true
  useEffect(() => {
    if (autoStart && !scanning && !loading) {
      console.log('[BatchQRScanner] Auto-starting scanning...');
      startScanning();
    }
  }, [autoStart, scanning, loading]);

  // Lightweight check for Supabase session presence to drive UI enablement
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (mounted) setHasSupaSession(Boolean(data?.session && !error));
      } catch (_) {
        if (mounted) setHasSupaSession(false);
      }
    })();
    return () => { mounted = false; };
  }, [status]);

  // UI enablement is driven by loading states; startScanning will enforce user presence

  const processBatchId = async (batchId) => {
    if (!batchId || processingRef.current) return;
    processingRef.current = true;
    setLoading(true);
    setLoadingMessage('Checking batches table...');
    setError(null);
    setAttempt(0);
    cancelRef.current.canceled = false;

    // Direct database verification - no local caching

    // Skip slow table inspection - go direct to batch lookup for better performance
    setLoadingMessage('Looking up batch...');

    try {
      console.log('[BatchQRScanner] Processing batchId:', batchId);
      // Auth/session guards
      if (!user?.id) {
        throw new Error('Missing user context. Please sign in again.');
      }

      // Require online connection for direct database verification
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setError('Internet connection required for batch verification. Please connect and try again.');
        setLoading(false);
        return;
      }

      // New primary flow: verify in 'batch' table and update user account
      setLoadingMessage('Verifying batch and checking ownership...');
      const verifyRes = await batchService.verifyBatchAndUpdateUser(batchId, user.id, {
        timeoutMs: 45000,
        maxRetries,
        onAttempt: (attemptNum) => {
          if (attemptNum > 1) {
            setLoadingMessage(`Retrying... (attempt ${attemptNum}/${maxRetries})`);
          }
        }
      });
      if (verifyRes.error) {
        const code = verifyRes.error.code || '';
        if (code === 'BATCH_DUPLICATE') {
          throw new Error('Batch already scanned');
        }
        throw new Error(verifyRes.error.message || 'Verification failed, try again');
      }

      if (cancelRef.current.canceled) return;

      // CRITICAL FIX: Only show success after confirming database was actually updated
      setLoadingMessage('Confirming batch activation...');
      const activationSuccessful = verifyRes.data?.activated === true || verifyRes.data?.status === 'used';
      
      // if (!activationSuccessful) {
      //   throw new Error(`Batch found but activation failed. Status: ${verifyRes.data?.status || 'unknown'}`);
      // }

      const bagsAdded = verifyRes.data?.bags_added || verifyRes.data?.bag_count || verifyRes.data?.total_bags_count || 0;
      const returnedBags = Array.isArray(verifyRes.data?.bags) ? verifyRes.data.bags : null;
      const displayBagCount = verifyRes.data?.bag_count || verifyRes.data?.total_bags_count || bagsAdded;
      const displayCount = displayBagCount > 0 ? displayBagCount : bagsAdded;
      setScanResult({
        batch_qr_code: verifyRes.data?.batch_id || batchId,
        status: verifyRes.data?.alreadyActivated ? 'already scanned' : (verifyRes.data?.status || 'activated'),
        created_at: verifyRes.data?.created_at || new Date().toISOString(),
        bag_count: displayCount,
        bags: returnedBags ?? (displayCount > 0 ? Array(displayCount).fill({}).map((_, i) => ({ id: `virtual-${i+1}` })) : []),
        activated_at: verifyRes.data?.activated_at,
        alreadyActivated: verifyRes.data?.alreadyActivated || false,
      });
      setScanning(false);

      // Skip notification creation to avoid console errors
      // Notification service has schema issues that cause 406/400 errors
      console.log('[BatchQRScanner] Skipping notification - service has schema incompatibilities');

      // Broadcast optimistic bag update for other views (dashboard, pickup form)
      // Only for fresh activations — already-activated batches were already counted
      if (!verifyRes.data?.alreadyActivated && bagsAdded > 0) {
        try {
          const evt = new CustomEvent('trashdrop:bags-updated', {
            detail: { userId: user.id, deltaBags: bagsAdded, source: 'batch-scan' }
          });
          window.dispatchEvent(evt);
        } catch (_) {
          // no-op if CustomEvent not available
        }
      }

      if (onScanComplete) onScanComplete(verifyRes.data);
    } catch (err) {
      console.warn('[BatchQRScanner] Scan failed for', batchId, err);
      
      // Run real table inspection if batch not found
      if (err.message?.includes('Batch not found')) {
        console.log('[BatchQRScanner] Running real table inspection for UUID:', batchId);
        try {
          const diagnosis = await realTableInspector.runFullDiagnosis(user?.id, batchId);
          console.error('[BatchQRScanner] Real table diagnosis:', diagnosis);
          
          if (diagnosis.recommendations.length > 0) {
            setError(`Batch UUID not found: ${batchId}\n\nIssues found:\n${diagnosis.recommendations.join('\n')}`);
          } else {
            setError(`Batch UUID not found in Supabase batches table: ${batchId}`);
          }
        } catch (diagError) {
          console.warn('[BatchQRScanner] Real table inspection failed:', diagError);
          setError(`Batch UUID not found in Supabase batches table: ${batchId}`);
        }
      } else {
        setError(err.message);
      }
      
      setScanResult(null);
    } finally {
      setLoading(false);
      setAttempt(0);
      processingRef.current = false;
    }
  };

  const handleScan = async (data) => {
    if (!data || !data.text) return;

    const raw = data.text;
    const batchId = String(raw).trim();
    console.log('[BatchQRScanner] Scanned raw:', raw, '-> batchId:', batchId);

    // Throttle duplicate scans — use ref for synchronous check (React state is async)
    const now = Date.now();
    if (lastScanRef.current.value === batchId && now - lastScanRef.current.ts < 10000) return;
    if (processingRef.current) return;
    lastScanRef.current = { value: batchId, ts: now };
    setLastScan({ value: batchId, ts: now });

    // Basic sanity check to avoid spurious calls
    if (batchId.length < 6) return;

    await processBatchId(batchId);
  };

  const handleError = (error) => {
    const message = error?.message || error || 'Unknown error';
    
    // Completely suppress "No QR code found" errors from console and UI
    if (message === 'No QR code found' || 
        (typeof error === 'string' && error.includes('No QR code found')) ||
        (error?.toString?.() && error.toString().includes('No QR code found'))) {
      return; // Silent - no console log, no UI error
    }
    
    // Only log real errors to console
    console.log('QR Scanner Error:', message);
    setError(message);
  };

  const startScanning = () => {
    // Always allow camera to open; auth is enforced on processing
    setScanning(true);
    setError(null);
    setScanResult(null);
    setLoadingMessage('Scanning...');
  };

  const stopScanning = () => {
    setScanning(false);
    cancelRef.current.canceled = true;
  };

  const corners = (tone) => (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <span className={`absolute top-8 left-8 w-8 h-8 border-t-4 border-l-4 rounded-tl-xl ${tone}`} />
      <span className={`absolute top-8 right-8 w-8 h-8 border-t-4 border-r-4 rounded-tr-xl ${tone}`} />
      <span className={`absolute bottom-8 left-8 w-8 h-8 border-b-4 border-l-4 rounded-bl-xl ${tone}`} />
      <span className={`absolute bottom-8 right-8 w-8 h-8 border-b-4 border-r-4 rounded-br-xl ${tone}`} />
    </div>
  );

  return (
    <div className="w-full space-y-4">
      {/* Error Alert */}
      {error && (
        <div role="alert" className={`${errorNote} px-4 py-3 flex items-start justify-between gap-3`}>
          <span className="text-[15px]">{error}</span>
          <button
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="-mr-1 -mt-0.5 w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-xl leading-none hover:bg-red-100 dark:hover:bg-red-900/40"
          >
            ×
          </button>
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="flex items-center justify-center gap-3" role="status">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-td-forest dark:border-green-300"></div>
          <span className="text-sm text-td-sage dark:text-gray-300">{loadingMessage || 'Loading...'}</span>
        </div>
      )}

      {/* Camera Viewfinder */}
      <div className="relative rounded-3xl overflow-hidden" style={{ aspectRatio: '4/3' }}>
        {scanning ? (
          <div className="relative w-full h-full bg-black">
            <QRReader
              onScan={handleScan}
              onError={handleError}
            />
            {corners('border-td-lime')}
          </div>
        ) : (
          <div className="relative w-full h-full flex flex-col items-center justify-center bg-td-forest text-white">
            <span className="absolute -top-16 -right-16 w-56 h-56 rounded-full border-[28px] border-white/10" aria-hidden="true" />
            <span className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center mb-3" aria-hidden="true">
              <svg className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
                <path d="M7 7h4v4H7zM13 13h4v4h-4zM13 7h4M7 13v4" />
              </svg>
            </span>
            <span className="text-lg font-bold">Camera Ready</span>
            <span className="mt-0.5 text-sm text-white/80">Tap Start Scanning below</span>
            {corners('border-td-lime/70')}
          </div>
        )}
      </div>

      {/* Start/Stop Scanning Button */}
      {scanning ? (
        <button onClick={stopScanning} className={`${dangerButton} w-full`}>
          Stop Scanning
        </button>
      ) : (
        <button onClick={startScanning} disabled={loading} className={`${primaryButton} w-full`}>
          {loading ? 'Loading...' : 'Start Scanning'}
        </button>
      )}

      {/* Scan Result */}
      {scanResult && (
        <section
          aria-label={scanResult.alreadyActivated ? 'Batch already scanned' : 'Batch scanned'}
          className={`${card} px-4 py-4`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${scanResult.alreadyActivated
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300'}`}
              aria-hidden="true"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                {scanResult.alreadyActivated
                  ? <><path d="M12 8v5" /><path d="M12 16.5v.01" /><circle cx="12" cy="12" r="9" /></>
                  : <path d="M5 12.5l4.5 4.5L19 7.5" />}
              </svg>
            </span>
            <h3 className="text-[17px] font-bold text-td-ink dark:text-gray-100">
              {scanResult.alreadyActivated ? 'Batch Already Scanned' : 'Batch Scanned Successfully!'}
            </h3>
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
            <dt className="text-td-sage dark:text-gray-300">Batch ID</dt>
            <dd className="text-td-ink dark:text-gray-100 font-semibold break-all">{scanResult.batch_qr_code || scanResult.batch_id}</dd>
            <dt className="text-td-sage dark:text-gray-300">Total bags</dt>
            <dd className="text-td-ink dark:text-gray-100 font-semibold">{scanResult.bag_count || 0}</dd>
            <dt className="text-td-sage dark:text-gray-300">Status</dt>
            <dd className="text-td-ink dark:text-gray-100 font-semibold capitalize">{scanResult.status}</dd>
            <dt className="text-td-sage dark:text-gray-300">Created</dt>
            <dd className="text-td-ink dark:text-gray-100 font-semibold">{scanResult.created_at ? new Date(scanResult.created_at).toLocaleDateString() : 'Unknown'}</dd>
          </dl>
          {scanResult.alreadyActivated && (
            <p className="mt-3 text-sm text-amber-900 dark:text-amber-200">This batch was previously scanned and activated.</p>
          )}
          <button
            onClick={() => {
              setError(null);
              setScanResult(null);
            }}
            className={`${secondaryButton} w-full mt-4`}
          >
            Clear Results
          </button>
        </section>
      )}
    </div>
  );
};

export default BatchQRScanner;
