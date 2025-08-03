import React from 'react';
import { useNavigate } from 'react-router-dom';
import BatchQRScanner from '../components/BatchQRScanner.js';

/**
 * QR Scanner page for scanning batch QR codes
 * Uses our new BatchQRScanner component with Supabase integration
 */
const QRScanner = () => {
  const navigate = useNavigate();

  const handleScanComplete = (batchDetails) => {
    console.log('Batch scanned successfully:', batchDetails);
    // Navigate to a success page or show details
    // For now, just stay on the scanner
  };

  return (
    <div className="min-h-screen bg-gray-800 text-white pt-2"> {/* Reduced padding-top to 0.5rem */}
      {/* Fixed Header (positioned below navbar) */}
      <div className="bg-gray-800 px-4 py-4 fixed top-16 left-0 right-0 z-40 shadow-md">
        <h1 className="text-2xl font-bold text-center text-white">
          Scan QR Code
        </h1>
      </div>

      {/* Scanner Section */}
      <div className="px-6 py-4">
        <BatchQRScanner onScanComplete={handleScanComplete} />
      </div>

      {/* How to Use Section */}
      <div className="px-6 py-4">
        <h2 className="text-lg font-semibold mb-4 text-white">How to Use</h2>
        <div className="space-y-3 text-gray-300">
          <div className="flex items-start">
            <span className="text-white font-medium mr-3">1.</span>
            <span>Find the TrashDrop Batch QR code for wrapped on the bags</span>
          </div>
          <div className="flex items-start">
            <span className="text-white font-medium mr-3">2.</span>
            <span>Click "Start Scanning" and aim your camera at the QR code</span>
          </div>
          <div className="flex items-start">
            <span className="text-white font-medium mr-3">3.</span>
            <span>Hold steady until the code is recognised and validated</span>
          </div>
          <div className="flex items-start">
            <span className="text-white font-medium mr-3">4.</span>
            <span>Earn points for each sorting and recycling trash</span>
          </div>
          <div className="flex items-start">
            <span className="text-white font-medium mr-3">5.</span>
            <span>Properly tie the flaps when the trash bag is full and ready for pickup</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRScanner;
