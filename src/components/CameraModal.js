import React, { useEffect, useRef, useState } from 'react';
import './CameraModal.css'; // Import CSS for flash animation

// Global flag to track if modal is already mounted to prevent multiple instances
if (typeof window !== 'undefined' && window.cameraModalMounted === undefined) {
  window.cameraModalMounted = false;
}

/**
 * Standalone camera modal component
 * This component is completely isolated from the rest of the application
 * to prevent interference with other components like maps
 */
const CameraModal = ({ onCapture, onClose, currentPhotoCount = 0 }) => {
  const [photoCount, setPhotoCount] = useState(currentPhotoCount);
  const maxPhotos = 5; // Maximum allowed photos
  const [cameraStream, setCameraStream] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const flashRef = useRef(null);

  // Initialize camera when component mounts with improved error handling
  // Force cleanup of any previously lingering camera resources on mount
  useEffect(() => {
    if (window.cameraStreamGlobal) {
      try {
        window.cameraStreamGlobal.getTracks().forEach(track => track.stop());
        window.cameraStreamGlobal = null;
        console.log('CameraModal: Cleaned up previous camera stream on mount');
      } catch (err) {
        console.error('CameraModal: Error cleaning up previous stream:', err);
      }
    }
  }, []);
  
  // Track initialization with a ref to prevent double initialization
  const hasCameraInitialized = useRef(false);
  
  // Main camera initialization effect
  useEffect(() => {
    // Skip initialization if we've already done it
    if (hasCameraInitialized.current) {
      console.log('CameraModal: Camera already initialized, skipping redundant init');
      return;
    }
    
    console.log('CameraModal: Starting camera initialization...');
    hasCameraInitialized.current = true;
    window.cameraModalMounted = true;
    
    let mounted = true;
    let attemptCount = 0;
    const maxAttempts = 2;
    
    const initCamera = async () => {
      try {
        if (!mounted) return;
        setIsLoading(true);
        attemptCount++;
        
        console.log(`CameraModal: Initializing camera (attempt ${attemptCount})...`);
        
        // Start with more modest constraints that are more likely to succeed
        const constraints = {
          video: {
            facingMode: 'environment', // Use back camera on mobile
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 }
          },
          audio: false
        };
        
        // Check if we already have a stream
        if (cameraStream) {
          console.log('CameraModal: Using existing camera stream');
          return;
        }
        
        console.log('CameraModal: Requesting media stream...');
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (!mounted) {
          // Component unmounted during async operation
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        console.log('CameraModal: Camera stream obtained');
        setCameraStream(stream);
        
        // Store stream in global variable for cross-component cleanup
        window.cameraStreamGlobal = stream;
        
        if (videoRef.current) {
          try {
            // Clean up any previous srcObject first
            if (videoRef.current.srcObject) {
              const oldStream = videoRef.current.srcObject;
              if (oldStream && oldStream !== stream && oldStream.getTracks) {
                oldStream.getTracks().forEach(track => track.stop());
              }
            }
            
            // Set new stream and play
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = async () => {
              if (!mounted) return;
              try {
                await videoRef.current.play();
                console.log('CameraModal: Video playback started');
              } catch (playError) {
                console.error('CameraModal: Error playing video:', playError);
                setError('Could not start video playback. Please try again.');
              }
            };
          } catch (videoError) {
            console.error('CameraModal: Error setting up video element:', videoError);
            setError('Could not initialize camera. Please try again.');
          }
        } else {
          console.error('CameraModal: Video element not available');
          setError('Camera interface not ready. Please try again.');
        }
      } catch (err) {
        if (mounted) {
          console.error('CameraModal: Camera error:', err);
          
          // Provide more helpful error messages based on error type
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setError('Camera access denied. Please enable camera permissions in your browser settings.');
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            setError('No camera found on your device. Please check your hardware.');
          } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            setError('Camera is in use by another application. Please close other apps using the camera.');
          } else {
            setError(`Camera error: ${err.message || 'Unknown error'}. Please try again.`);
          }
          
          // Retry with more basic constraints if we haven't reached max attempts
          if (attemptCount < maxAttempts) {
            console.log('CameraModal: Retrying with more basic constraints...');
            setTimeout(() => {
              if (mounted) {
                initCamera();
              }
            }, 1000);
          }
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };
    
    // Begin camera initialization
    initCamera();
    
    // Handle visibility change to restart camera if needed
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mounted && !cameraStream && videoRef.current && !videoRef.current.srcObject) {
        console.log('CameraModal: Document became visible again, restarting camera...');
        initCamera();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Cleanup function
    return () => {
      console.log('CameraModal: Running cleanup');
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      // Ensure stream is stopped and cleaned up on unmount
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (err) {
            console.error('CameraModal: Error stopping track:', err);
          }
        });
      }
      
      // Also clear global reference
      if (window.cameraStreamGlobal) {
        window.cameraStreamGlobal.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (err) {
            console.error('CameraModal: Error stopping global track:', err);
          }
        });
        window.cameraStreamGlobal = null;
      }
      
      // Reset initialization flag when component is fully unmounted
      hasCameraInitialized.current = false;
      window.cameraModalMounted = false;
    };
  }, []); // Empty dependency array to run only once

  // Force garbage collection if available (Chrome)
  const forceGarbageCollection = () => {
    try {
      if (window.gc && typeof window.gc === 'function') {
        window.gc();
        console.log('CameraModal: Forced garbage collection');
      }
    } catch (e) {
      // Ignore errors
    }
  };
  
  // Cleanup photos when count changes
  useEffect(() => {
    if (photoCount > 2) { // After 2 photos, start aggressive cleanup
      setTimeout(() => {
        forceGarbageCollection();
      }, 500);
    }
  }, [photoCount]);

  // Check available memory with more aggressive thresholds
  const checkMemoryAvailable = () => {
    try {
      if (window.performance && window.performance.memory) {
        const memoryInfo = window.performance.memory;
        const usedHeapRatio = memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit;
        
        console.log('CameraModal: Memory check', {
          usedHeap: Math.round(memoryInfo.usedJSHeapSize / (1024 * 1024)) + 'MB',
          heapLimit: Math.round(memoryInfo.jsHeapSizeLimit / (1024 * 1024)) + 'MB',
          usedRatio: (usedHeapRatio * 100).toFixed(1) + '%'
        });
        
        // More aggressive threshold - 60% instead of 70%
        if (usedHeapRatio > 0.6) {
          console.warn('CameraModal: Low memory detected, forcing cleanup');
          forceGarbageCollection();
          return false;
        }
      }
      return true;
    } catch (e) {
      console.warn('CameraModal: Error checking memory:', e);
      return true;
    }
  };

  // Cleanup previous photo URLs to prevent memory leaks
  const cleanupPhotoUrls = useRef(new Set());
  
  const addPhotoUrlForCleanup = (url) => {
    cleanupPhotoUrls.current.add(url);
  };
  
  const cleanupAllPhotoUrls = () => {
    try {
      cleanupPhotoUrls.current.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          console.warn('CameraModal: Error revoking URL:', e);
        }
      });
      cleanupPhotoUrls.current.clear();
      console.log('CameraModal: Cleaned up photo URLs');
    } catch (e) {
      console.error('CameraModal: Error in cleanup:', e);
    }
  };
  
  // Ultra-optimized, crash-proof photo capture
  const capturePhoto = () => {
    console.log('CameraModal: Starting photo capture...');
    
    // Show flash effect
    if (flashRef.current) {
      flashRef.current.style.opacity = '0.7';
      setTimeout(() => {
        if (flashRef.current) flashRef.current.style.opacity = '0';
      }, 150);
    }
    
    // Check photo limit early to avoid unnecessary processing
    if (photoCount >= maxPhotos) {
      setError(`Maximum ${maxPhotos} photos reached.`);
      return;
    }

    // Extensive readiness checks
    if (!videoRef.current || !canvasRef.current || !cameraStream) {
      console.error('CameraModal: Camera not ready');
      setError('Camera not ready. Please wait and try again.');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Thorough video state verification
    if (video.videoWidth === 0 || video.videoHeight === 0 || video.paused || video.ended) {
      console.error('CameraModal: Video stream not active', { 
        width: video.videoWidth, 
        height: video.videoHeight,
        paused: video.paused,
        ended: video.ended
      });
      setError('Camera feed not ready. Please try again.');
      return;
    }

    try {
      // Balanced capture settings: good quality without excessive memory/upload cost
      // 800x600 @ 60% quality = ~50-80KB per image (vs 15-30KB before)
      // This is a ~3x increase but still manageable for mobile devices
      const captureWidth = 800;
      const captureHeight = 600;
      
      console.log('CameraModal: Capture size', { captureWidth, captureHeight });
      
      // Set canvas size
      canvas.width = captureWidth;
      canvas.height = captureHeight;
      
      // Force garbage collection before drawing (unofficial but helps)
      if (window.gc) window.gc();
      
      // Simple draw operation with fixed dimensions
      // Using willReadFrequently=true attribute for performance optimization
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, captureWidth, captureHeight);
      
      // 60% JPEG quality - good balance between clarity and file size
      const dataURL = canvas.toDataURL('image/jpeg', 0.6);
      
      // Clear canvas immediately after capture to free memory
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Simplified blob creation with smaller memory footprint
      const byteCharacters = atob(dataURL.split(',')[1]);
      const byteArray = new Uint8Array(byteCharacters.length);
      
      // Optimized loop
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }
      
      const blob = new Blob([byteArray], { type: 'image/jpeg' });
      
      // Create photo object
      const photoId = Date.now() + Math.random(); // Ensure uniqueness
      const photoUrl = URL.createObjectURL(blob);
      
      const newPhoto = {
        id: photoId,
        dataUrl: dataURL, // Use the dataURL directly for compatibility
        url: photoUrl,
        blob: blob,
        timestamp: new Date().toISOString(),
        size: blob.size
      };
      
      console.log('CameraModal: Photo captured', {
        id: photoId,
        size: (blob.size / 1024).toFixed(1) + 'KB',
        dimensions: `${captureWidth}x${captureHeight}`
      });
      
      // Force garbage collection after blob creation (unofficial but helps)
      if (window.gc) window.gc();
      
      // Update count
      setPhotoCount(prev => prev + 1);
      
      // Simple flash effect
      try {
        const flashDiv = document.createElement('div');
        flashDiv.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255,255,255,0.8);
          z-index: 9999;
          pointer-events: none;
        `;
        document.body.appendChild(flashDiv);
        
        setTimeout(() => {
          try {
            document.body.removeChild(flashDiv);
          } catch (e) {
            // Ignore cleanup errors
          }
        }, 150);
      } catch (flashError) {
        // Ignore flash errors
      }
      
      // Immediate canvas cleanup
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 1;
        canvas.height = 1;
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      // Track URL for later cleanup
      addPhotoUrlForCleanup(photoUrl);
      
      // Pass to parent immediately
      onCapture(newPhoto);
      
    } catch (error) {
      console.error('CameraModal: Photo capture failed:', error);
      setError('Photo capture failed. Please try again.');
      
      // Reset canvas on error
      try {
        canvas.width = 1;
        canvas.height = 1;
      } catch (e) {
        // Ignore
      }
    }
  };

  // Handle close with improved cleanup
  const handleClose = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Clear mounted flag immediately
    window.cameraModalMounted = false;
    
    // Stop the camera stream with error handling
    if (cameraStream) {
      try {
        cameraStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (trackErr) {
            console.error('CameraModal: Error stopping track:', trackErr);
          }
        });
        setCameraStream(null);
      } catch (streamErr) {
        console.error('CameraModal: Error stopping stream:', streamErr);
      }
    }
    
    // Clean up global reference to camera stream
    if (window.cameraStreamGlobal) {
      try {
        window.cameraStreamGlobal.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (trackErr) {
            console.error('CameraModal: Error stopping global track:', trackErr);
          }
        });
        window.cameraStreamGlobal = null;
      } catch (streamErr) {
        console.error('CameraModal: Error stopping global stream:', streamErr);
      }
    }
    
    // Clean up video element
    if (videoRef.current && videoRef.current.srcObject) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (videoErr) {
        console.error('CameraModal: Error cleaning video element:', videoErr);
      }
    }
    
    // Clear any stored camera state
    sessionStorage.removeItem('showCamera');
    localStorage.removeItem('cameraModalOpen');
    
    console.log('CameraModal: Closed and cleaned up');
    
    // Call the onClose callback
    // Wrap in setTimeout to ensure it runs after current execution context
    setTimeout(() => {
      onClose();
    }, 50);
  };

  return (
    <div 
      className="fixed inset-0 bg-black z-[9999]" 
      style={{ position: 'fixed', isolation: 'isolate' }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // stopImmediatePropagation removed - not supported in React synthetic events
      }}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('CameraModal: Prevented form submission');
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-center p-4 bg-gray-800">
        <h3 className="text-white text-lg font-medium">Take Photo</h3>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleClose(e);
          }}
          className="absolute top-4 right-4 bg-gray-700 w-10 h-10 rounded-full text-white hover:bg-gray-600 flex items-center justify-center text-2xl font-bold z-10"
          aria-label="Close camera"
        >
          ×
        </button>
      </div>
      
      {/* Camera View */}
      <div className="flex-1 relative bg-black camera-view-container" style={{ height: 'calc(100vh - 60px)' }}>
        {/* Flash element */}
        <div
          ref={flashRef}
          className="absolute inset-0 bg-white z-20"
          style={{ opacity: 0, transition: 'opacity 150ms ease-out' }}
        ></div>
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
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleClose(e);
                }}
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
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              capturePhoto();
            }}
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
          {photoCount}/{maxPhotos}
        </div>
      </div>
      
      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default CameraModal;
