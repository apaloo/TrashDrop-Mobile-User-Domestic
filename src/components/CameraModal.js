import React, { useEffect, useRef, useState } from 'react';

/**
 * Standalone camera modal component
 * This component is completely isolated from the rest of the application
 * to prevent interference with other components like maps
 */
const CameraModal = ({ onClose, onCapture, maxPhotos = 6, currentCount = 0 }) => {
  const [cameraStream, setCameraStream] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Initialize camera when component mounts
  useEffect(() => {
    let mounted = true;
    
    const initCamera = async () => {
      try {
        setIsLoading(true);
        console.log('CameraModal: Initializing camera...');
        
        const constraints = {
          video: {
            facingMode: 'environment', // Use back camera on mobile
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };
        
        console.log('CameraModal: Requesting media stream...');
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (!mounted) {
          // Component unmounted during async operation
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        console.log('CameraModal: Camera stream obtained');
        setCameraStream(stream);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
            console.log('CameraModal: Video playback started');
          } catch (playError) {
            console.error('CameraModal: Error playing video:', playError);
            setError('Could not start video playback');
          }
        }
      } catch (err) {
        if (mounted) {
          console.error('CameraModal: Camera error:', err);
          setError(`Camera access denied: ${err.message}. Please enable camera permissions in your browser settings.`);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };
    
    initCamera();
    
    // Cleanup function
    return () => {
      mounted = false;
      if (cameraStream) {
        console.log('CameraModal: Stopping camera on unmount');
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Handle capture photo
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !cameraStream) {
      console.error('CameraModal: Camera not ready for photo capture');
      setError('Camera not ready. Please try again.');
      return;
    }

    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');
      
      // Ensure video is loaded and has dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.error('CameraModal: Video not loaded properly');
        setError('Camera feed not ready. Please try again.');
        return;
      }
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      
      // Convert canvas to blob with higher quality
      canvas.toBlob((blob) => {
        if (!blob) {
          console.error('CameraModal: Failed to create photo blob');
          setError('Failed to capture photo. Please try again.');
          return;
        }
        
        const photoUrl = URL.createObjectURL(blob);
        const newPhoto = {
          id: Date.now(),
          url: photoUrl,
          blob: blob,
          timestamp: new Date().toISOString()
        };
        
        console.log('CameraModal: Photo captured successfully');
        onCapture(newPhoto);
        
        // Could add feedback here (flash effect, etc.)
      }, 'image/jpeg', 0.9);
      
    } catch (err) {
      console.error('CameraModal: Error capturing photo:', err);
      setError('Failed to capture photo. Please try again.');
    }
  };

  // Handle close
  const handleClose = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Stop the camera stream
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    
    // Call the onClose callback
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 bg-black z-[9999]" 
      style={{ position: 'fixed', isolation: 'isolate' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex justify-between items-center p-4 bg-gray-800">
        <h3 className="text-white text-lg font-medium">Take Photo</h3>
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 bg-gray-700 w-10 h-10 rounded-full text-white hover:bg-gray-600 flex items-center justify-center text-2xl font-bold z-10"
          aria-label="Close camera"
        >
          ×
        </button>
      </div>
      
      {/* Camera View */}
      <div className="flex-1 relative bg-black" style={{ height: 'calc(100vh - 60px)' }}>
        {/* Video element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          onError={(e) => {
            console.error('CameraModal: Video element error:', e);
            setError('Camera error. Please try again.');
          }}
        />
        
        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-black bg-opacity-70">
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p>Starting camera...</p>
            </div>
          </div>
        )}
        
        {/* Error message */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-20 bg-black bg-opacity-80">
            <div className="text-white text-center max-w-md p-4">
              <div className="text-red-500 text-5xl mb-4">⚠️</div>
              <p className="text-lg font-bold mb-2">Camera Error</p>
              <p>{error}</p>
              <button
                onClick={handleClose}
                className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        )}
        
        {/* Camera controls */}
        <div className="absolute bottom-6 left-0 right-0 flex justify-center items-center z-20">
          {/* Flash/Settings button (left) */}
          <div className="w-12 h-12 mr-8"></div>
          
          {/* Capture button (center) */}
          <button
            onClick={capturePhoto}
            disabled={!cameraStream || isLoading}
            className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg disabled:opacity-50 border-4 border-white"
            aria-label="Capture photo"
          >
            <div className="w-16 h-16 bg-blue-600 rounded-full"></div>
          </button>
          
          {/* Empty space for symmetry (right) */}
          <div className="w-12 h-12 ml-8"></div>
        </div>
        
        {/* Photo count indicator */}
        <div className="absolute top-4 right-16 bg-black bg-opacity-70 text-white px-3 py-1 rounded-full text-sm z-20">
          {currentCount}/{maxPhotos}
        </div>
      </div>
      
      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default CameraModal;
