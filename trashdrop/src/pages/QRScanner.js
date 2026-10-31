import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BatchQRScanner from '../components/BatchQRScanner.js';
import PageHeader from '../components/ui/PageHeader.js';
import { card, primaryButton, sectionTitle } from '../components/ui/styles.js';

const STEPS = [
  'Find the TrashDrop batch QR code wrapped on the bundle of bags',
  'Tap "Start Scanning" and aim your camera at the QR code',
  'Hold steady until the code is recognised and validated',
  'Earn points for each sorting and recycling trash',
  'Properly tie the flaps when the trash bag is full and ready for pickup',
];

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
    <div className="max-w-3xl mx-auto px-2 pb-24 space-y-5">
      <PageHeader
        title="Scan QR Code"
        subtitle="Scan the QR code on your bundle of bags to add them to your account."
      />

      <BatchQRScanner onScanComplete={handleScanComplete} autoStart={autoStart} />

      {/* Continue Setup button — visible after scan when coming from onboarding */}
      {isOnboarding && scannedBatch && (
        <button onClick={handleContinueOnboarding} className={`${primaryButton} w-full`}>
          Continue Setup
        </button>
      )}

      <section aria-labelledby="how-to-scan" className={`${card} px-4 py-4`}>
        <h2 id="how-to-scan" className={sectionTitle}>How to use</h2>
        <ol className="mt-3 space-y-3">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-td-tonal text-td-forest-dk dark:bg-green-900/40 dark:text-green-300 text-sm font-bold flex items-center justify-center" aria-hidden="true">
                {i + 1}
              </span>
              <span className="pt-0.5 text-[15px] leading-snug text-td-ink dark:text-gray-200">{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
};

export default QRScanner;
