import React from 'react';

const AdditionalInfoStep = ({ formData, updateFormData, nextStep, prevStep }) => {
  const handleNotesChange = (e) => {
    updateFormData({ notes: e.target.value });
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Additional Notes</h2>
      
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
          rows={4}
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
          onClick={nextStep}
          className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-md transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default AdditionalInfoStep;
