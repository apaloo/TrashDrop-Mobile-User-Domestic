import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

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
        // For now, we'll still simulate the scanning after a delay
        setTimeout(() => {
          // Simulate successful scan 80% of the time
          const success = Math.random() > 0.2;
          
          if (success) {
            // Generate a random bin ID and location
            const binId = `BIN-${Math.floor(1000 + Math.random() * 9000)}`;
            const location = 'City Center, Main St';
            const earnedPoints = Math.floor(10 + Math.random() * 30);
            
            // Set scan result
            setScanResult({
              binId,
              location,
              timestamp: new Date().toISOString(),
              points: earnedPoints
            });
            
            // Update points
            setPoints(earnedPoints);
            
            // Save scan to "database" (in a real app, this would be an API call)
            saveScan({
              binId,
              location,
              timestamp: new Date().toISOString(),
              userId: user?.id,
              points: earnedPoints
            });
          } else {
            // Simulate error
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

  // Function to save scan result (in a real app, this would be an API call)
  const saveScan = async (scanData) => {
    setLoading(true);
    
    try {
      // Simulate API call
      console.log('Saving scan data:', scanData);
      
      // In a real app, this would store data in IndexedDB when offline
      // and sync when back online using the service worker
      
      // Simulate successful save
      setTimeout(() => {
        setLoading(false);
      }, 1000);
    } catch (err) {
      console.error('Error saving scan:', err);
      setError('Failed to save scan result.');
      setLoading(false);
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
  
  // Function to handle requesting pickup for the scanned bin
  const handleRequestPickup = () => {
    if (scanResult) {
      navigate('/pickup-request', { 
        state: { 
          binId: scanResult.binId,
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
