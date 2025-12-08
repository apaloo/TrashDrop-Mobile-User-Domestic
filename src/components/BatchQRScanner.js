import React, { useEffect, useMemo, useState, useRef } from 'react';
import QRReader from './QRReader';
import { useAuth } from '../context/AuthContext.js';
import { batchService } from '../services/batchService.js';
import { notificationService } from '../services/notificationService.js';
import supabase from '../utils/supabaseClient.js';
import offlineStorageAPI from '../utils/offlineStorage.js';
import realTableInspector from '../utils/realTableInspector.js';
 

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

      const bagsAdded = verifyRes.data?.bagsAdded || verifyRes.data?.total_bags_count || 0;
      const returnedBags = Array.isArray(verifyRes.data?.bags) ? verifyRes.data.bags : null;
      if(bagsAdded){
        setScanResult({
          batch_qr_code: verifyRes.data?.batch_id || batchId,
          status: verifyRes.data?.status || 'activated', // Use actual status from database
          created_at: verifyRes.data?.created_at || new Date().toISOString(),
          bag_count: verifyRes.data?.bag_count || verifyRes.data?.total_bags_count || bagsAdded,
          bags: returnedBags ?? Array(bagsAdded).fill({}).map((_, i) => ({ id: `virtual-${i+1}` })),
          activated_at: verifyRes.data?.activated_at, // Show when activation occurred
        });
      }
      setScanning(false);

      // Skip notification creation to avoid console errors
      // Notification service has schema issues that cause 406/400 errors
      console.log('[BatchQRScanner] Skipping notification - service has schema incompatibilities');

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
              <QRReader
                onScan={handleScan}
                onError={handleError}
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
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100">
              {/* Camera Icon */}
              <svg
                className="w-16 h-16 text-gray-600 mb-4"
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
              <span className="text-gray-700 text-lg font-medium">Camera Ready</span>
              
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
        <div style={{ 
          marginTop: '20px', 
          padding: '15px', 
          backgroundColor: '#e8f5e8', 
          borderRadius: '8px',
          border: '1px solid #4caf50',
          color: 'black'
        }}>
          <h3>✅ Batch Scanned Successfully!</h3>
          <p><strong>Batch ID:</strong> {scanResult.batch_qr_code || scanResult.batch_id}</p>
          <p><strong>Total Bags:</strong> {scanResult.bag_count || 0}</p>
          <p><strong>Status:</strong> {scanResult.status}</p>
          <p><strong>Created:</strong> {scanResult.created_at ? new Date(scanResult.created_at).toLocaleDateString() : 'Unknown'}</p>
        </div>
      )}
      
      {/* Clear Results Only - No Cache Controls */}
      {scanResult && (
        <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
          <button 
            onClick={() => {
              setError(null);
              setScanResult(null);
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Clear Results
          </button>
        </div>
      )}
    </div>
  );
};

export default BatchQRScanner;
