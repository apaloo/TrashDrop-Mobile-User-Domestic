import React, { useState, useEffect } from 'react';
import QrScanner from 'react-qr-scanner';
import { useAuth } from '../contexts/AuthContext.js';
import { batchService } from '../services/batchService.js';
import { notificationService } from '../services/notificationService.js';

const BatchQRScanner = ({ onScanComplete }) => {
  const { user } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleScan = async (data) => {
    if (data && data.text && !loading) {
      setLoading(true);
      setError(null);
      
      try {
        // Extract batch ID from QR code
        const batchId = data?.text?.replace('BATCH-', '') || data;
        
        // Get batch details
        const { data: batchDetails, error: batchError } = await batchService.getBatchDetails(batchId);
        
        if (batchError) {
          throw new Error(batchError.message);
        }

        // Validate batch
        if (!batchDetails) {
          throw new Error('Invalid batch QR code');
        }

        // Check if batch belongs to user
        if (batchDetails.user_id !== user.id) {
          throw new Error('This batch is not assigned to you');
        }

        // Activate batch and update stats
        const { data: activationData, error: activationError } = await batchService.activateBatchForUser(batchId, user.id);
        if (activationError) {
          throw new Error(activationError.message || 'Failed to activate batch');
        }

        const alreadyActivated = activationData?.alreadyActivated;

        setScanResult(batchDetails);
        setScanning(false);

        // Create notification for successful scan
        await notificationService.createNotification(
          user.id,
          'batch_scan',
          alreadyActivated ? 'Batch Already Activated' : 'Batch Activated',
          alreadyActivated
            ? `Batch ${batchDetails.batch_qr_code} has already been activated.`
            : `Batch ${batchDetails.batch_qr_code} is now active and your bag balance has been updated.`,
          { batch_id: batchDetails.id }
        );

        // Call parent callback
        if (onScanComplete) {
          onScanComplete(batchDetails);
        }

      } catch (err) {
        setError(err.message);
        setScanResult(null);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleError = (err) => {
    console.error('QR Scanner Error:', err);
    setError('Failed to access camera. Please check permissions.');
  };

  const startScanning = () => {
    setScanning(true);
    setError(null);
    setScanResult(null);
  };

  const stopScanning = () => {
    setScanning(false);
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
