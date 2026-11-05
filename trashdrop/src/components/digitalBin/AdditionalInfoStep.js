import React, { useState } from 'react';
import { FaCamera, FaTrash } from 'react-icons/fa';
import CameraModal from '../CameraModal';
import PhotoViewer from '../ui/PhotoViewer.js';
import { toastService } from '../../services/toastService';
import StepNav from './StepNav.js';
import { card, fieldHint, infoNote, inputField, sectionTitle } from '../ui/styles.js';

// The camera screen must stop at the same number the labels below promise
const MAX_BIN_PHOTOS = 3;

// Service frequencies offered in ScheduleDetailsStep
const FREQUENCY_LABELS = {
  'one-time': 'One-time',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly'
};

const AdditionalInfoStep = ({ formData, updateFormData, nextStep, prevStep }) => {
  const [photos, setPhotos] = useState(formData.photos || []);
  // Index of the photo open full screen, or null
  const [viewerIndex, setViewerIndex] = useState(null);
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
      
      toastService.success(`Photo ${newPhotos.length}/${MAX_BIN_PHOTOS} captured successfully`);

      if (newPhotos.length >= MAX_BIN_PHOTOS) {
        setShowCamera(false);
        toastService.info(`Maximum photos reached (${MAX_BIN_PHOTOS})`);
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
      toastService.warning('Please take at least one photo of your waste bin');
      return;
    }
    nextStep();
  };

  return (
    <div className="space-y-4">
      {/* Photo Capture Section */}
      <section className={`${card} px-4 py-4`}>
        <h2 className={sectionTitle}>Waste Bin Photos</h2>
        <p className={`${fieldHint} mt-1 mb-3`}>
          Required. Take photos of your filled up waste bin for service. This helps our collectors locate and service your bin efficiently.
        </p>

        {/* Camera Button */}
        <button
          type="button"
          onClick={() => setShowCamera(true)}
          disabled={photos.length >= MAX_BIN_PHOTOS}
          className={`w-full h-32 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-colors ${
            photos.length >= MAX_BIN_PHOTOS
              ? 'border-td-border bg-td-cream dark:border-gray-600 dark:bg-gray-900/40 cursor-not-allowed'
              : 'border-td-border-strong dark:border-gray-500 hover:bg-td-cream dark:hover:bg-gray-700'
          }`}
        >
          <span className={`w-11 h-11 rounded-xl flex items-center justify-center mb-2 ${
            photos.length >= MAX_BIN_PHOTOS ? 'bg-gray-100 text-td-sage dark:bg-gray-700 dark:text-gray-400' : 'bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300'
          }`} aria-hidden="true">
            <FaCamera className="text-lg" />
          </span>
          <span className="text-[15px] font-semibold text-td-ink dark:text-gray-100">
            {photos.length === 0 ? 'Take Photos' : 'Add More Photos'}
          </span>
          <span className="text-xs text-td-sage dark:text-gray-300 mt-0.5">
            {photos.length}/{MAX_BIN_PHOTOS} photos taken
          </span>
        </button>

        {/* Camera Modal */}
        {showCamera && (
          <CameraModal
            onCapture={handlePhotoCapture}
            onClose={handleCameraClose}
            currentPhotoCount={photos.length}
            maxPhotos={MAX_BIN_PHOTOS}
          />
        )}

        {/* Photo Previews */}
        {photos.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-td-ink dark:text-gray-100 mb-2">
              Your Photos ({photos.length}/{MAX_BIN_PHOTOS})
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              {photos.map((photo, index) => (
                <div key={index} className="relative">
                  <button
                    type="button"
                    onClick={() => setViewerIndex(index)}
                    aria-label={`Open photo ${index + 1} of ${photos.length}`}
                    className="block w-full aspect-square bg-td-cream dark:bg-gray-900 rounded-xl border border-td-border dark:border-gray-700 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <img 
                      src={photo} 
                      alt={`Waste Bin ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-700 hover:bg-red-800 text-white flex items-center justify-center shadow"
                    aria-label={`Remove photo ${index + 1}`}
                  >
                    <FaTrash className="text-xs" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Additional Notes */}
      <section className={`${card} px-4 py-4`}>
        <label htmlFor="notes" className={`${sectionTitle} block mb-1.5`}>
          Additional Notes <span className="font-normal text-[15px] text-td-sage dark:text-gray-300">(Optional)</span>
        </label>
        <textarea
          id="notes"
          value={formData.notes}
          onChange={handleNotesChange}
          placeholder="Any special instructions for servicing your waste bin?"
          rows={3}
          className={`${inputField} resize-none`}
        />
        <p className={`${fieldHint} mt-1.5`}>
          Add any special instructions or notes for the service provider
        </p>
      </section>
      
      {/* Service Information */}
      <div className={`${infoNote} px-4 py-3.5 text-sm`}>
        <p className="font-semibold text-[15px] mb-1">Service Details</p>
        <p>Service fee will be calculated based on waste type, size, and number of bins</p>
        <p className="mt-1">
          Frequency: {FREQUENCY_LABELS[formData.frequency] || formData.frequency}
          {formData.frequency && formData.frequency !== 'one-time' ? ' - this request is one collection; we remind you before the next.' : ''}
        </p>
      </div>
      
      <StepNav
        onBack={prevStep}
        onNext={handleNext}
        disabled={photos.length === 0}
        missingText="Take at least one photo to continue."
        missingId="photos-step-missing"
      />

      {viewerIndex !== null && photos.length > 0 && (
        <PhotoViewer
          photos={photos}
          index={Math.min(viewerIndex, photos.length - 1)}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
};

export default AdditionalInfoStep;
