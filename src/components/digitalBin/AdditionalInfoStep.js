import React, { useState } from 'react';
import { FaCamera, FaTrash, FaCheckCircle } from 'react-icons/fa';
import CameraModal from '../CameraModal';
import { toastService } from '../../services/toastService';

const AdditionalInfoStep = ({ formData, updateFormData, nextStep, prevStep }) => {
  const [photos, setPhotos] = useState(formData.photos || []);
  const [showCamera, setShowCamera] = useState(false);

  const handleNotesChange = (e) => {
    updateFormData({ notes: e.target.value });
  };

  const handleCameraClose = () => {
    setShowCamera(false);
  };

  const handlePhotoCapture = (photo) => {
    try {
      if (!photo || (!photo.dataUrl && !photo.url)) {
        throw new Error('Invalid photo data');
      }

      const photoUrl = photo.dataUrl || photo.url;
      const newPhotos = [...photos, photoUrl];
      setPhotos(newPhotos);
      updateFormData({ photos: newPhotos });
      
      toastService.success(`Photo ${newPhotos.length}/3 captured successfully`);

      if (newPhotos.length >= 3) {
        setShowCamera(false);
        toastService.info('Maximum photos reached (3)');
      }
    } catch (error) {
      console.error('Photo capture error:', error);
      toastService.error('Failed to capture photo. Please try again.');
    }
  };

  const removePhoto = (index) => {
    try {
      const newPhotos = photos.filter((_, i) => i !== index);
      setPhotos(newPhotos);
      updateFormData({ photos: newPhotos });
      toastService.success('Photo removed successfully');
    } catch (error) {
      console.error('Error removing photo:', error);
      toastService.error('Failed to remove photo');
    }
  };

  const handleNext = () => {
    if (photos.length === 0) {
      toastService.warning('Please take at least one photo of your digital bin area');
      return;
    }
    nextStep();
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Digital Bin Area Photos</h2>
      
      {/* Photo Capture Section */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-900 mb-1">
          Photos of Digital Bin Area (Required)
        </label>
        <p className="text-sm text-gray-600 mb-3">
          Take photos of where you'll place your digital bin for service. This helps our collectors locate and service your bin efficiently.
        </p>

        {/* Camera Button */}
        <button
          type="button"
          onClick={() => setShowCamera(true)}
          disabled={photos.length >= 3}
          className={`w-full h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center
            ${photos.length >= 3 ? 'bg-gray-100 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'}
            transition-colors`}
        >
          <FaCamera className={`text-2xl mb-2 ${photos.length >= 3 ? 'text-gray-400' : 'text-primary'}`} />
          <span className="text-sm font-medium text-gray-700">
            {photos.length === 0 ? 'Take Photos' : 'Add More Photos'}
          </span>
          <span className="text-xs text-gray-500 mt-1">
            {photos.length}/3 photos taken
          </span>
        </button>

        {/* Camera Modal */}
        {showCamera && (
          <CameraModal
            onCapture={handlePhotoCapture}
            onClose={handleCameraClose}
            currentPhotoCount={photos.length}
          />
        )}

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
                    alt={`Digital Bin Area ${index + 1}`}
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
          placeholder="Any special instructions for servicing your digital bin?"
          rows={3}
          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 font-medium"
          style={{color: '#333'}}
        />
        <p className="text-sm text-gray-500 mt-1">
          Add any special instructions or notes for the service provider
        </p>
      </div>
      
      {/* Service Information */}
      <div className="mb-5 bg-gray-50 p-4 rounded-md">
        <h3 className="text-lg font-semibold mb-3 text-gray-900">Service Details</h3>
        <p className="text-sm text-gray-700 font-medium mb-2">
          Service fee will be calculated based on waste type, size, and number of bins
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
