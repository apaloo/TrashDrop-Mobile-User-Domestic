import React, { useState, useRef, useEffect } from 'react';
import { FaCamera, FaTrash, FaCheckCircle } from 'react-icons/fa';

const AdditionalInfoStep = ({ formData, updateFormData, nextStep, prevStep }) => {
  const [photos, setPhotos] = useState(formData.photos || []);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const handleNotesChange = (e) => {
    updateFormData({ notes: e.target.value });
  };

  const startCamera = async () => {
    console.log('Starting camera...');
    setCameraError(null);
    
    try {
      // Simple environment check
      if (typeof window === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported in this environment');
      }

      // Stop any existing camera stream
      stopCamera();

      // Get or create video element
      if (!videoRef.current) {
        const video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.style.width = '100%';
        video.style.height = 'auto';
        video.style.display = 'none';
        videoRef.current = video;
      }

      const video = videoRef.current;
      video.style.display = 'block';

      // Try to access the camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        });
        
        streamRef.current = stream;
        video.srcObject = stream;
        
        // Wait for the video to be ready
        await new Promise((resolve) => {
          video.onloadedmetadata = () => {
            video.play();
            resolve();
          };
        });
        
        setIsCameraActive(true);
      } catch (err) {
        console.error('Camera error:', err);
        setCameraError('Could not access the camera. Please check permissions.');
        stopCamera();
      }
    } catch (error) {
      console.error('Error initializing camera:', error);
      setCameraError('Failed to initialize camera. Please try again.');
      stopCamera();
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      const video = videoRef.current;
      video.pause();
      video.srcObject = null;
    }
    
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !streamRef.current) return;
    
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const newPhoto = canvas.toDataURL('image/jpeg', 0.9);
    const newPhotos = [...photos, newPhoto];
    
    setPhotos(newPhotos);
    updateFormData({ photos: newPhotos });
    
    if (newPhotos.length >= 3) {
      stopCamera();
    }
  };

  const removePhoto = (index) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    setPhotos(newPhotos);
    updateFormData({ photos: newPhotos });
  };

  const handleNext = () => {
    if (photos.length === 0) {
      alert('Please take at least one photo of your bin or trash bag.');
      return;
    }
    nextStep();
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Bin/Trash Bag Photos</h2>
      
      {/* Photo Capture Section */}
      <div className="mb-6">
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-900 mb-1">
            Photos of Bin/Trash Bag (Required)
          </label>
          <p className="text-sm text-gray-600 mb-3">
            A photo of your bin or trash bag helps us assign the right waste carrier for your needs.
            {photos.length < 3 && (
              <span className="block text-xs text-gray-500 mt-1">
                {photos.length === 0 
                  ? 'Please take at least 1 photo (max 3)'
                  : `You can take ${3 - photos.length} more photo${3 - photos.length > 1 ? 's' : ''}`}
              </span>
            )}
          </p>

          {/* Video element - always in DOM but hidden when not active */}
          <div className="relative bg-black rounded-lg overflow-hidden mb-4" style={{ display: isCameraActive ? 'block' : 'none' }}>
            <video 
              ref={videoRef}
              data-camera-preview="true"
              autoPlay
              playsInline
              muted
              className="w-full h-64 object-cover"
              style={{ display: 'block' }}
            />
            {isCameraActive && (
              <>
                <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                  <button
                    onClick={capturePhoto}
                    disabled={photos.length >= 3}
                    className="bg-white p-3 rounded-full shadow-lg hover:bg-gray-100 disabled:opacity-50"
                    aria-label="Capture photo"
                  >
                    <FaCamera className="text-gray-800 text-xl" />
                  </button>
                </div>
                <button
                  onClick={stopCamera}
                  className="absolute top-2 right-2 bg-black bg-opacity-50 text-white p-2 rounded-full"
                  aria-label="Stop camera"
                >
                  ✕
                </button>
              </>
            )}
          </div>
          
          {/* Start Camera Button - shown when camera is not active */}
          {!isCameraActive && (
            <button
              type="button"
              onClick={startCamera}
              disabled={photos.length >= 3}
              className="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-primary hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FaCamera className="text-gray-400 text-2xl mb-2" />
              <span className="text-sm font-medium text-gray-700">
                {photos.length === 0 ? 'Take a Photo' : 'Take Another Photo'}
              </span>
              <span className="text-xs text-gray-500 mt-1">
                {photos.length}/3 photos taken
              </span>
            </button>
          )}

          {cameraError && (
            <p className="text-red-500 text-sm mt-2">{cameraError}</p>
          )}
        </div>

        {/* Photo Previews */}
        {photos.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Your Photos ({photos.length}/3)
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, index) => (
                <div key={index} className="relative group">
                  <img 
                    src={photo} 
                    alt={`Bin/Trash Bag ${index + 1}`}
                    className="w-full h-24 object-cover rounded-lg border border-gray-200"
                  />
                  <button
                    onClick={() => removePhoto(index)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                    aria-label="Remove photo"
                  >
                    <FaTrash className="text-xs" />
                  </button>
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-lg transition-colors">
                    <FaCheckCircle className="text-white opacity-0 group-hover:opacity-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Additional Notes */}
      <div className="mb-5">
        <label htmlFor="notes" className="block text-sm font-medium text-gray-900 mb-1">
          Additional Notes (Optional)
        </label>
        <textarea
          id="notes"
          value={formData.notes}
          onChange={handleNotesChange}
          placeholder="Any special instructions?"
          rows={3}
          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 font-medium"
        />
        <p className="text-sm text-gray-500 mt-1">
          Add any special instructions or notes for the collector
        </p>
      </div>
      
      {/* Pricing Information */}
      <div className="mb-5 bg-gray-50 p-4 rounded-md">
        <h3 className="text-lg font-semibold mb-3 text-gray-900">Pricing</h3>
        <p className="text-sm text-gray-700 font-medium mb-2">
          Price will be calculated based on waste type, size, and number of bags
        </p>
        <p className="text-sm text-gray-700 font-medium">
          Based on your selected frequency: {formData.frequency === 'weekly' ? 'Weekly' : 
                                          formData.frequency === 'biweekly' ? 'Bi-weekly' : 'Monthly'}
        </p>
      </div>
      
      <div className="flex justify-between mt-6">
        <button
          type="button"
          onClick={prevStep}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={photos.length === 0}
          className={`px-6 py-2 rounded-md transition-colors ${
            photos.length === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-primary hover:bg-primary-dark text-white'
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default AdditionalInfoStep;
