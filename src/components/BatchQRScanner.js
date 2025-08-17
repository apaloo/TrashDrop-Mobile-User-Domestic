import React, { useEffect, useMemo, useState, useRef } from 'react';
import QrScanner from 'react-qr-scanner';
import { useAuth } from '../context/AuthContext.js';
import { batchService } from '../services/batchService.js';
import { notificationService } from '../services/notificationService.js';
import supabase from '../utils/supabaseClient.js';
import offlineStorageAPI from '../utils/offlineStorage.js';
 

const BatchQRScanner = ({ onScanComplete }) => {
  const { user, session, loading: authLoading, status } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const maxRetries = 3;
  const [lastScan, setLastScan] = useState({ value: '', ts: 0 });
  const [hasSupaSession, setHasSupaSession] = useState(false);
  const cancelRef = useRef({ canceled: false });

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
    if (!batchId || loading) return;
    setLoading(true);
    setLoadingMessage('Verifying batch...');
    setError(null);
    setAttempt(0);
    cancelRef.current.canceled = false;

    try {
      console.log('[BatchQRScanner] Processing batchId:', batchId);
      // Auth/session guards
      if (!user?.id) {
        throw new Error('Missing user context. Please sign in again.');
      }

      // If offline: local-first -> queue activation for later sync, prevent duplicate
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        // Prevent re-queueing the same batch locally
        if (batchService.isBatchLocallyScanned(batchId)) {
          setError('This batch is already queued or scanned.');
          setLoading(false);
          return;
        }
        setLoadingMessage('Offline — saving scan and queuing sync...');
        const queued = await batchService.enqueueBatchActivation(batchId, user.id);
        if (queued?.error) {
          setError(queued.error.message || 'Failed to queue scan while offline. Please try again.');
          setLoading(false);
          return;
        }
        setScanResult({
          batch_qr_code: batchId,
          status: 'queued',
          created_at: new Date().toISOString(),
          bags: [],
        });
        setScanning(false);
        if (onScanComplete) onScanComplete({ batch_id: batchId, status: 'queued' });
        setLoading(false);
        return;
      }

      // New primary flow: verify in 'batch' table and update user account
      setLoadingMessage('Verifying batch...');
      const verifyRes = await batchService.verifyBatchAndUpdateUser(batchId, user.id, {
        timeoutMs: 10000,
        maxRetries,
      });
      if (verifyRes.error) {
        const code = verifyRes.error.code || '';
        if (code === 'BATCH_DUPLICATE') {
          throw new Error('Batch already scanned');
        }
        throw new Error(verifyRes.error.message || 'Verification failed, try again');
      }

      if (cancelRef.current.canceled) return;

      const bagsAdded = verifyRes.data?.bagsAdded || verifyRes.data?.total_bags_count || 0;
      const returnedBags = Array.isArray(verifyRes.data?.bags) ? verifyRes.data.bags : null;
      setScanResult({
        batch_qr_code: verifyRes.data?.batch_id || batchId,
        status: 'verified',
        created_at: verifyRes.data?.created_at || new Date().toISOString(),
        bags: returnedBags ?? Array(bagsAdded).fill({}).map((_, i) => ({ id: `virtual-${i+1}` })),
      });
      setScanning(false);

      await notificationService.createNotification(
        user.id,
        'batch_scan',
        'Batch Verified',
        `+${bagsAdded} bags added!`,
        { batch_id: verifyRes.data?.batch_id || batchId }
      );

      // Broadcast optimistic bag update for other views (dashboard, pickup form)
      try {
        const evt = new CustomEvent('trashdrop:bags-updated', {
          detail: { userId: user.id, deltaBags: bagsAdded, source: 'batch-scan' }
        });
        window.dispatchEvent(evt);
      } catch (_) {
        // no-op if CustomEvent not available
      }

      if (onScanComplete) onScanComplete(verifyRes.data);
    } catch (err) {
      console.warn('[BatchQRScanner] Scan failed for', batchId, err);
      setError(err.message);
      setScanResult(null);
    } finally {
      setLoading(false);
      setAttempt(0);
    }
  };

  const handleScan = async (data) => {
    if (!data || !data.text) return;

    const raw = data.text;
    const batchId = String(raw).trim();
    console.log('[BatchQRScanner] Scanned raw:', raw, '-> batchId:', batchId);

    // Throttle duplicate scans within 2s or identical value
    const now = Date.now();
    if (lastScan.value === batchId && now - lastScan.ts < 2000) return;
    setLastScan({ value: batchId, ts: now });

    // Basic sanity check to avoid spurious calls
    if (batchId.length < 6) return;

    await processBatchId(batchId);
  };

  const handleError = (err) => {
    console.error('QR Scanner Error:', err);
    const msg = String(err?.message || err || '');
    if (msg.includes('Requested device not found')) {
      setError('No camera found.');
    } else if (msg.toLowerCase().includes('permission')) {
      setError('Camera permission denied. Please allow camera access in your browser settings.');
    } else {
      setError('Failed to access camera. Please check permissions.');
    }
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

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Error Alert */}
      {error && (
        <div className="mb-4 p-4 bg-red-900 border border-red-700 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-red-200">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-300 hover:text-red-100 font-bold text-xl leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="flex justify-center my-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-sm text-blue-300">{loadingMessage || 'Loading...'}</span>
        </div>
      )}

      {/* Camera Interface */}
      <div className="relative">
        {/* Camera Viewfinder */}
        <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
          {scanning ? (
            <div className="relative w-full h-full">
              <QrScanner
                delay={300}
                constraints={{
                  video: { facingMode: 'environment' }
                }}
                onScan={handleScan}
                onError={handleError}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
              {/* Camera Overlay with Corner Markers */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Top Left Corner */}
                <div className="absolute top-12 left-12 w-6 h-6">
                  <div className="absolute top-0 left-0 w-6 h-1 bg-white"></div>
                  <div className="absolute top-0 left-0 w-1 h-6 bg-white"></div>
                </div>
                {/* Top Right Corner */}
                <div className="absolute top-12 right-12 w-6 h-6">
                  <div className="absolute top-0 right-0 w-6 h-1 bg-white"></div>
                  <div className="absolute top-0 right-0 w-1 h-6 bg-white"></div>
                </div>
                {/* Bottom Left Corner */}
                <div className="absolute bottom-12 left-12 w-6 h-6">
                  <div className="absolute bottom-0 left-0 w-6 h-1 bg-white"></div>
                  <div className="absolute bottom-0 left-0 w-1 h-6 bg-white"></div>
                </div>
                {/* Bottom Right Corner */}
                <div className="absolute bottom-12 right-12 w-6 h-6">
                  <div className="absolute bottom-0 right-0 w-6 h-1 bg-white"></div>
                  <div className="absolute bottom-0 right-0 w-1 h-6 bg-white"></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900">
              {/* Camera Icon */}
              <svg
                className="w-16 h-16 text-gray-400 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span className="text-gray-300 text-lg font-medium">Camera Ready</span>
              
              {/* Corner Markers for inactive state */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Top Left Corner */}
                <div className="absolute top-12 left-12 w-6 h-6">
                  <div className="absolute top-0 left-0 w-6 h-1 bg-white opacity-60"></div>
                  <div className="absolute top-0 left-0 w-1 h-6 bg-white opacity-60"></div>
                </div>
                {/* Top Right Corner */}
                <div className="absolute top-12 right-12 w-6 h-6">
                  <div className="absolute top-0 right-0 w-6 h-1 bg-white opacity-60"></div>
                  <div className="absolute top-0 right-0 w-1 h-6 bg-white opacity-60"></div>
                </div>
                {/* Bottom Left Corner */}
                <div className="absolute bottom-12 left-12 w-6 h-6">
                  <div className="absolute bottom-0 left-0 w-6 h-1 bg-white opacity-60"></div>
                  <div className="absolute bottom-0 left-0 w-1 h-6 bg-white opacity-60"></div>
                </div>
                {/* Bottom Right Corner */}
                <div className="absolute bottom-12 right-12 w-6 h-6">
                  <div className="absolute bottom-0 right-0 w-6 h-1 bg-white opacity-60"></div>
                  <div className="absolute bottom-0 right-0 w-1 h-6 bg-white opacity-60"></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Start/Stop Scanning Button */}
        <div className="mt-6">
          {scanning ? (
            <button
              onClick={stopScanning}
              className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
            >
              Stop Scanning
            </button>
          ) : (
            <button
              onClick={startScanning}
              disabled={loading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Loading...' : 'Start Scanning'}
            </button>
          )}
        </div>
      </div>

      {/* Manual Input Fallback removed as requested */}

      {/* Scan Result */}
      {scanResult && (
        <div className="mt-6 p-4 bg-gray-700 rounded-lg border border-gray-600">
          <h3 className="text-lg font-semibold mb-3 text-white">Batch Details:</h3>
          <div className="space-y-2 text-gray-300">
            <div>
              <span className="font-medium text-white">Batch ID:</span> {scanResult.batch_qr_code}
            </div>
            <div>
              <span className="font-medium text-white">Total Bags:</span> {scanResult.bags?.length || 0}
            </div>
            <div>
              <span className="font-medium text-white">Status:</span> {scanResult.status}
            </div>
            <div>
              <span className="font-medium text-white">Created:</span> {new Date(scanResult.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchQRScanner;
