import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { supabase } from '../utils/supabaseClient';

/**
 * QR Scanner component for scanning trash bin QR codes
 * In a production app, would use react-qr-reader, but we'll simulate it here
 */
const QRScanner = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [permission, setPermission] = useState(false);
  const [error, setError] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [points, setPoints] = useState(0);
  
  // Check camera permission
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setPermission(true);
        // Clean up stream tracks
        stream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.error('Camera permission error:', err);
        setError('Camera access denied. Please enable camera permissions.');
        setPermission(false);
      }
    };
    
    checkPermission();
  }, []);

  // Video element reference to display camera feed
  const videoRef = React.useRef(null);
  // Stream reference to store the camera stream for cleanup
  const streamRef = React.useRef(null);
  
  // Function to validate TrashDrops QR codes
  const validateQRCode = (qrData) => {
    try {
      // TrashDrops QR codes should have a specific format like:
      // For batch codes: TRASHDROP:BATCH:{batchId}:{bagCount}:{timestamp}:{signature}
      // For bag codes: TRASHDROP:BAG:{bagId}:{batchId}:{timestamp}:{signature}
      if (!qrData.startsWith('TRASHDROP:')) {
        return { isValid: false, message: 'This is not a valid TrashDrops QR code. Please scan codes from authorized trash bags only.' };
      }
      
      const parts = qrData.split(':');
      
      // Validate based on code type
      if (parts[1] === 'BATCH' && parts.length === 6) {
        // This is a batch code
        return { 
          isValid: true,
          codeType: 'BATCH',
          batchId: parts[2],
          bagCount: parseInt(parts[3], 10),
          timestamp: parts[4],
          signature: parts[5]
        };
      } 
      else if (parts[1] === 'BAG' && parts.length === 6) {
        // This is a bag code
        return { 
          isValid: true,
          codeType: 'BAG',
          bagId: parts[2],
          batchId: parts[3],
          timestamp: parts[4],
          signature: parts[5]
        };
      } 
      else if (parts.length === 4) {
        // Legacy format for backward compatibility
        return { 
          isValid: true,
          codeType: 'LEGACY',
          binId: parts[1],
          timestamp: parts[2],
          signature: parts[3]
        };
      }
      else {
        // Invalid format
        return { isValid: false, message: 'Invalid QR code format. Please use authorized trash bags.' };
      }
    } catch (error) {
      console.error('QR code validation error:', error);
      return { isValid: false, message: 'Error validating QR code.' };
    }
  };

  // Function to actually scan QR code using device camera
  const startScanning = () => {
    setScanning(true);
    setScanResult(null);
    setError('');
    
    if (!permission) {
      setError('Camera permission is required to scan QR codes');
      setScanning(false);
      return;
    }
    
    // Access the device camera
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        // Store stream for cleanup
        streamRef.current = stream;
        
        // Display the camera feed
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play()
            .catch(err => {
              console.error('Error playing video:', err);
              setError('Could not start video stream');
              setScanning(false);
            });
        }
        
        // In a real app, we would use a QR code scanning library here
        // For now, we'll simulate the scanning after a delay
        setTimeout(() => {
          // Simulate successful scan 80% of the time
          const success = Math.random() > 0.2;
          
          if (success) {
            // Generate a simulated QR code data
            const timestamp = Date.now().toString();
            const signature = `SIG-${Math.random().toString(36).substring(2, 15)}`;
            
            // 80% chance of valid TrashDrops QR code, 20% chance of invalid QR code
            const randomValue = Math.random();
            let qrData;
            
            if (randomValue > 0.8) {
              // Invalid QR code
              qrData = `https://example.com/some-other-qr-code`;
            } else if (randomValue > 0.4) {
              // Generate batch code
              const batchId = `BATCH-${Math.floor(1000 + Math.random() * 9000)}`;
              const bagCount = Math.floor(1 + Math.random() * 10); // 1 to 10 bags
              qrData = `TRASHDROP:BATCH:${batchId}:${bagCount}:${timestamp}:${signature}`;
            } else {
              // Generate bag code
              const bagId = `BAG-${Math.floor(1000 + Math.random() * 9000)}`;
              const batchId = `BATCH-${Math.floor(1000 + Math.random() * 9000)}`;
              qrData = `TRASHDROP:BAG:${bagId}:${batchId}:${timestamp}:${signature}`;
            }
            
            // Validate the QR code
            const validationResult = validateQRCode(qrData);
            
            if (validationResult.isValid) {
              // Get location
              const location = 'City Center, Main St';
              const earnedPoints = Math.floor(10 + Math.random() * 30);
              
              // Set scan result based on code type
              const scanResultData = {
                codeType: validationResult.codeType,
                location,
                timestamp: new Date().toISOString(),
                points: earnedPoints
              };
              
              if (validationResult.codeType === 'BATCH') {
                scanResultData.batchId = validationResult.batchId;
                scanResultData.bagCount = validationResult.bagCount;
              } else if (validationResult.codeType === 'BAG') {
                scanResultData.bagId = validationResult.bagId;
                scanResultData.batchId = validationResult.batchId;
              } else {
                // Legacy code
                scanResultData.binId = validationResult.binId;
              }
              
              setScanResult(scanResultData);
              
              // Update points
              setPoints(earnedPoints);
              
              // Save scan to Supabase with appropriate data structure
              const scanData = {
                location,
                timestamp: new Date().toISOString(),
                userId: user?.id,
                points: earnedPoints,
                codeType: validationResult.codeType
              };
              
              if (validationResult.codeType === 'BATCH') {
                scanData.batchId = validationResult.batchId;
                scanData.bagCount = validationResult.bagCount;
              } else if (validationResult.codeType === 'BAG') {
                scanData.bagId = validationResult.bagId;
                scanData.batchId = validationResult.batchId;
              } else {
                // Legacy code
                scanData.binId = validationResult.binId;
              }
              
              saveScan(scanData);
            } else {
              // Invalid QR code
              setError(validationResult.message);
            }
          } else {
            // Simulate scan error
            setError('Could not recognize QR code. Please try again.');
          }
          
          // Stop the camera when done scanning
          stopCamera();
          setScanning(false);
        }, 2000);
      })
      .catch(err => {
        console.error('Error accessing camera:', err);
        setError('Could not access camera. Please check your permissions.');
        setScanning(false);
      });
  };

  // Function to save scan result to Supabase
  const saveScan = async (scanData) => {
    setLoading(true);
    
    try {
      if (!user || !user.id) {
        throw new Error('User not authenticated');
      }
      
      const scanRecord = {
        user_id: user.id,
        location: scanData.location,
        scan_time: scanData.timestamp,
        points: scanData.points,
        code_type: scanData.codeType
      };
      
      // Add appropriate fields based on code type
      if (scanData.codeType === 'BATCH') {
        scanRecord.batch_id = scanData.batchId;
        scanRecord.bag_count = scanData.bagCount;
      } else if (scanData.codeType === 'BAG') {
        scanRecord.bag_id = scanData.bagId;
        scanRecord.batch_id = scanData.batchId;
      } else {
        scanRecord.bin_id = scanData.binId;
      }
      
      // Store in Supabase
      const { data, error } = await supabase
        .from('scans')
        .insert([scanRecord]);
      
      if (error) throw error;
      
      console.log('QR scan saved to database:', data);
      
      // Update user stats depending on the scan type
      if (scanData.codeType === 'BATCH') {
        // For batch codes, increment batch count and bag count
        await supabase.rpc('update_user_batch_scan', { 
          user_id_param: user.id, 
          points_to_add: scanData.points,
          bags_to_add: scanData.bagCount
        });
      } else if (scanData.codeType === 'BAG') {
        // For bag codes, we don't update bag counts as they are included in batches
        await supabase.rpc('increment_user_points', { 
          user_id_param: user.id, 
          points_to_add: scanData.points 
        });
      } else {
        // Legacy code handling
        await supabase.rpc('increment_user_points', { 
          user_id_param: user.id, 
          points_to_add: scanData.points 
        });
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Error saving scan:', err);
      setError('Failed to save scan result to database.');
      setLoading(false);
      
      // Store locally for offline mode
      try {
        const offlineScans = JSON.parse(localStorage.getItem('offlineScans') || '[]');
        offlineScans.push({...scanData, syncPending: true});
        localStorage.setItem('offlineScans', JSON.stringify(offlineScans));
        console.log('Scan saved offline for later sync');
      } catch (localError) {
        console.error('Error saving scan offline:', localError);
      }
    }
  };

  // Function to stop the camera feed
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  };

  // Clean up camera on component unmount
  useEffect(() => {
    return () => stopCamera();
  }, []);
  
  // Function to handle requesting pickup for the scanned bin or bag
  const handleRequestPickup = () => {
    if (scanResult) {
      navigate('/pickup-request', { 
        state: { 
          codeType: scanResult.codeType,
          ...(scanResult.codeType === 'BATCH' ? { batchId: scanResult.batchId, bagCount: scanResult.bagCount } : {}),
          ...(scanResult.codeType === 'BAG' ? { bagId: scanResult.bagId, batchId: scanResult.batchId } : {}),
          ...(scanResult.codeType === 'LEGACY' ? { binId: scanResult.binId } : {}),
          location: scanResult.location
        }
      });
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Scan QR Code</h1>
        
        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded relative mb-4" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        
        {/* Camera preview area */}
        <div className="bg-black aspect-square w-full relative rounded-lg overflow-hidden mb-4">
          {/* Video element to show camera feed */}
          <video 
            ref={videoRef}
            className={`w-full h-full object-cover ${scanning ? 'block' : 'hidden'}`}
            playsInline
            muted
          />
          
          {scanning ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <LoadingSpinner size="lg" color="white" />
              <span className="text-white ml-3">Scanning...</span>
            </div>
          ) : permission ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              {scanResult ? (
                <div className="text-center p-4 bg-green-600/80 w-full">
                  <svg className="w-16 h-16 mx-auto text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-lg font-medium">Scan Successful!</p>
                </div>
              ) : (
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p>Camera Ready</p>
                </div>
              )}
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center p-4">
              <svg className="w-16 h-16 mx-auto text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="mt-2">Camera access required</p>
              <p className="text-sm opacity-80">Please enable camera permissions in your browser settings</p>
            </div>
          )}
          
          {/* Camera alignment guides */}
          {permission && !scanResult && !scanning && (
            <>
              <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-white" />
              <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-white" />
              <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-white" />
              <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-white" />
            </>
          )}
        </div>
        
        {/* Scan button */}
        {permission && !scanning && (
          <button
            onClick={startScanning}
            disabled={scanning || loading}
            className={`w-full py-3 px-4 rounded-md font-medium ${
              scanResult 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-primary hover:bg-primary-dark text-white'
            } transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-gray-400 disabled:cursor-not-allowed`}
          >
            {scanResult ? 'Scan Another' : 'Start Scanning'}
          </button>
        )}
        
        {/* Scan result */}
        {scanResult && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h3 className="text-lg font-medium text-gray-800 dark:text-white mb-2">Scan Details</h3>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Bin ID:</span>
                <span className="font-medium text-gray-800 dark:text-white">{scanResult.binId}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Location:</span>
                <span className="font-medium text-gray-800 dark:text-white">{scanResult.location}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Time:</span>
                <span className="font-medium text-gray-800 dark:text-white">
                  {new Date(scanResult.timestamp).toLocaleTimeString()}
                </span>
              </div>
              
              <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-600">
                <span className="text-gray-600 dark:text-gray-300">Points Earned:</span>
                <span className="font-bold text-lg text-green-600 dark:text-green-400">+{points}</span>
              </div>
            </div>
            
            {/* Request pickup button */}
            <button
              onClick={handleRequestPickup}
              className="mt-4 w-full py-2 px-4 bg-primary hover:bg-primary-dark text-white rounded-md transition-colors"
            >
              Request Pickup
            </button>
          </div>
        )}
        
        {/* Instructions */}
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white mb-2">How to Use</h3>
          <ol className="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-300">
            <li>Find the TrashDrop Batch QR code for wrapped on the the bags</li>
            <li>Click "Start Scanning" and aim your camera at the QR code</li>
            <li>Hold steady until the code is recognised and validated</li>
            <li>Earn points for each sorting and recycling trash</li>
            <li>Properly tie the flaps when the trash bag is full and ready for pickup</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default QRScanner;
