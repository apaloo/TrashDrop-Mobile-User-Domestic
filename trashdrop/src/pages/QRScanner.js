import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BatchQRScanner from '../components/BatchQRScanner.js';

/**
 * QR Scanner page for scanning batch QR codes
 * Uses our new BatchQRScanner component with Supabase integration
 */
const QRScanner = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoStart = searchParams.get('auto_start') === 'true';
  const source = searchParams.get('source');
  const isOnboarding = source === 'onboarding';

  // Store batch details so we can show them before navigating back
  const [scannedBatch, setScannedBatch] = useState(null);

  const handleScanComplete = (batchDetails) => {
    console.log('Batch scanned successfully:', batchDetails);
    
    if (isOnboarding) {
      // Store details — let BatchQRScanner show its result card first
      // User will tap "Continue Setup" to go back to onboarding
      setScannedBatch(batchDetails);
    }
    // Normal flow: stay on scan page so user can see the batch details card
  };

  const handleContinueOnboarding = () => {
    const batchId = scannedBatch?.batch_id || scannedBatch?.batchId || 'scanned';
    const bagCount = scannedBatch?.bag_count || scannedBatch?.bags_added || scannedBatch?.total_bags_count || 0;
    navigate(`/dashboard?source=onboarding&action=qr-scanned&qr_code=${batchId}&bag_count=${bagCount}`);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 pt-2" style={{ minHeight: '100vh', paddingTop: '75px' }}>
      {/* Fixed Header (positioned below navbar) */}
      <div className="bg-white dark:bg-gray-800 px-4 py-4 fixed top-16 left-0 right-0 z-40 shadow-md">
        <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-gray-100">
          Scan QR Code
        </h1>
      </div>

      {/* Scanner Section */}
      <div className="px-6 py-4">
        <BatchQRScanner onScanComplete={handleScanComplete} autoStart={autoStart} />
      </div>

      {/* Continue Setup button — visible after scan when coming from onboarding */}
      {isOnboarding && scannedBatch && (
        <div className="px-6 pb-4">
          <button
            onClick={handleContinueOnboarding}
            className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors text-lg"
          >
            Continue Setup
          </button>
        </div>
      )}

      {/* How to Use Section */}
      <div className="px-6 py-4">
        <h2 className="text-lg font-semibold mb-4 text-gray-900">How to Use</h2>
        <div className="space-y-3 text-gray-700">
          <div className="flex items-start">
            <span className="text-gray-900 font-medium mr-3">1.</span>
            <span>Find the TrashDrop Batch QR code wrapped on the bundle of bags</span>
          </div>
          <div className="flex items-start">
            <span className="text-gray-900 font-medium mr-3">2.</span>
            <span>Click "Start Scanning" and aim your camera at the QR code</span>
          </div>
          <div className="flex items-start">
            <span className="text-gray-900 font-medium mr-3">3.</span>
            <span>Hold steady until the code is recognised and validated</span>
          </div>
          <div className="flex items-start">
            <span className="text-gray-900 font-medium mr-3">4.</span>
            <span>Earn points for each sorting and recycling trash</span>
          </div>
          <div className="flex items-start">
            <span className="text-gray-900 font-medium mr-3">5.</span>
            <span>Properly tie the flaps when the trash bag is full and ready for pickup</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRScanner;
