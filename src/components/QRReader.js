import React, { useEffect, useRef, useState } from 'react';
import QrScanner from 'qr-scanner';

// No need to set WORKER_PATH in newer versions of qr-scanner library

const QRReader = ({
  delay = 300,
  constraints = { video: { facingMode: 'environment' } },
  onScan,
  onError,
  style = { width: '100%', height: '100%', objectFit: 'cover' }
}) => {
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const [securityError, setSecurityError] = useState(false);

  // Check if we're in a secure context (HTTPS or localhost)
  const isSecureContext = window.location.protocol === 'https:' || 
                          window.location.hostname === 'localhost' ||
                          window.location.hostname === '127.0.0.1';

  useEffect(() => {
    if (!videoRef.current) return;
    
    // Only attempt scanner setup in secure contexts
    if (!isSecureContext) {
      const securityErrorMsg = 'Camera access requires HTTPS. Please use a secure connection.';
      console.warn(securityErrorMsg);
      setSecurityError(true);
      onError?.({message: securityErrorMsg});
      return;
    }

    const setupScanner = async () => {
      try {
        if (!scannerRef.current) {
          scannerRef.current = new QrScanner(
            videoRef.current,
            result => onScan?.({ text: result.data }),
            {
              onDecodeError: error => {
                // Don't show errors for normal decode attempts
                if (error?.name !== 'QRScannerError') {
                  onError?.(error);
                }
              },
              highlightScanRegion: true,
              highlightCodeOutline: true,
              ...constraints,
              returnDetailedScanResult: true
            }
          );
        }
        await scannerRef.current.start();
      } catch (err) {
        // Check for permissions denied
        if (err.name === 'NotAllowedError') {
          const permissionMsg = 'Camera permission was denied. Please allow camera access.';
          console.warn(permissionMsg);
          onError?.({message: permissionMsg});
        } else {
          console.error('QR Scanner error:', err);
          onError?.(err);
        }
      }
    };

    setupScanner();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.destroy();
        scannerRef.current = null;
      }
    };
  }, [onScan, onError, constraints, isSecureContext]);

  return (
    <>
      {securityError && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: '#f44336',
          color: 'white',
          padding: '10px',
          textAlign: 'center',
          zIndex: 1000
        }}>
          Camera access requires HTTPS. Please use a secure connection or try using localhost.
        </div>
      )}
      <video ref={videoRef} style={style} />
    </>
  );
};

export default QRReader;
