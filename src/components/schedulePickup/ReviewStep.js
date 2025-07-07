import React, { useState } from 'react';

const ReviewStep = ({ formData, prevStep, handleSubmit }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Format waste type for display
  const formatWasteType = (type) => {
    switch (type) {
      case 'general':
        return 'General Waste';
      case 'recycling':
        return 'Recycling';
      case 'organic':
        return 'Organic Waste';
      default:
        return type;
    }
  };
  
  // Format preferred time for display
  const formatPreferredTime = (time) => {
    switch (time) {
      case 'morning':
        return 'Morning (8am - 12pm)';
      case 'afternoon':
        return 'Afternoon (12pm - 4pm)';
      case 'evening':
        return 'Evening (4pm - 8pm)';
      default:
        return time;
    }
  };
  
  // Format frequency for display
  const formatFrequency = (freq) => {
    switch (freq) {
      case 'weekly':
        return 'Weekly';
      case 'biweekly':
        return 'Bi-weekly';
      case 'monthly':
        return 'Monthly';
      default:
        return freq;
    }
  };
  
  // Handle form submission
  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      await handleSubmit();
    } catch (error) {
      console.error('Error submitting form:', error);
      setIsSubmitting(false);
    }
  };
  
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Review & Submit</h2>
      
      <div className="bg-gray-50 p-4 rounded-md mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-900">Pickup Location</h3>
        <p className="text-gray-900 font-medium">
          {formData.address || 'Custom location'}
        </p>
        <div className="text-sm text-gray-700 font-medium mt-1">
          Coordinates: {formData.latitude?.toFixed(6)}, {formData.longitude?.toFixed(6)}
        </div>
      </div>
      
      <div className="bg-gray-50 p-4 rounded-md mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-900">Schedule Details</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-sm text-gray-700 font-medium">Frequency:</span>
            <p className="text-gray-900 font-medium">{formatFrequency(formData.frequency)}</p>
          </div>
          <div>
            <span className="text-sm text-gray-700 font-medium">Start Date:</span>
            <p className="text-gray-900 font-medium">{formData.startDate}</p>
          </div>
          <div>
            <span className="text-sm text-gray-700 font-medium">Preferred Time:</span>
            <p className="text-gray-900 font-medium">{formatPreferredTime(formData.preferredTime)}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-gray-50 p-4 rounded-md mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-900">Waste Details</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-sm text-gray-700 font-medium">Number of Bags:</span>
            <p className="text-gray-900 font-medium">{formData.numberOfBags} Bag{formData.numberOfBags > 1 ? 's' : ''}</p>
          </div>
          <div>
            <span className="text-sm text-gray-700 font-medium">Waste Type:</span>
            <p className="text-gray-900 font-medium">{formatWasteType(formData.wasteType)}</p>
          </div>
        </div>
      </div>
      
      {formData.notes && (
        <div className="bg-gray-50 p-4 rounded-md mb-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-900">Additional Notes</h3>
          <p className="text-gray-900 font-medium whitespace-pre-wrap">{formData.notes}</p>
        </div>
      )}
      
      <div className="bg-gray-50 p-4 rounded-md mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-900">Pricing</h3>
        <p className="text-gray-900 font-medium">
          Price will be calculated based on waste type, size, and number of bags
        </p>
        <div className="text-sm text-gray-700 font-medium mt-1">
          Based on your selected frequency: {formatFrequency(formData.frequency)}
        </div>
      </div>
      
      <div className="flex justify-between mt-6">
        <button
          type="button"
          onClick={prevStep}
          disabled={isSubmitting}
          className="px-6 py-2 border border-gray-300 text-gray-900 font-medium rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <span className="inline-block animate-spin mr-2">⟳</span>
              Processing...
            </>
          ) : (
            'Schedule Recurring Pickup'
          )}
        </button>
      </div>
    </div>
  );
};

export default ReviewStep;
