import React from 'react';

const ScheduleDetailsStep = ({ formData, updateFormData, nextStep, prevStep }) => {
  // Helper to determine if form is valid
  const isValid = () => {
    return formData.frequency && formData.startDate && formData.preferredTime;
  };

  // Handle start date change
  const handleDateChange = (e) => {
    updateFormData({ startDate: e.target.value });
  };

  // Helper text for frequency selection
  const getFrequencyHelperText = () => {
    switch (formData.frequency) {
      case 'weekly':
        return 'Your pickup will occur every week on the same day';
      case 'biweekly':
        return 'Your pickup will occur every two weeks on the same day';
      case 'monthly':
        return 'Your pickup will occur once a month on the same date';
      default:
        return '';
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Schedule Details</h2>
      
      {/* Pickup Frequency */}
      <div className="mb-5">
        <label htmlFor="frequency" className="block text-sm font-medium text-gray-900 mb-1">
          Pickup Frequency
        </label>
        <select
          id="frequency"
          value={formData.frequency}
          onChange={(e) => updateFormData({ frequency: e.target.value })}
          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 font-medium"
        >
          <option value="weekly">Weekly</option>
          <option value="biweekly">Bi-weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <p className="text-sm text-gray-500 mt-1">
          {getFrequencyHelperText()}
        </p>
      </div>
      
      {/* Start Date */}
      <div className="mb-5">
        <label htmlFor="startDate" className="block text-sm font-medium text-gray-900 mb-1">
          Start Date
        </label>
        <div className="relative">
          <input
            type="date"
            id="startDate"
            value={formData.startDate}
            onChange={handleDateChange}
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 font-medium"
            placeholder="dd/mm/yyyy"
            min={new Date().toISOString().split('T')[0]} // Prevent past dates
          />
          <div className="absolute top-0 right-0 px-3 py-3 pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
      
      {/* Preferred Time */}
      <div className="mb-5">
        <label htmlFor="preferredTime" className="block text-sm font-medium text-gray-900 mb-1">
          Preferred Time (not guaranteed)
        </label>
        <select
          id="preferredTime"
          value={formData.preferredTime}
          onChange={(e) => updateFormData({ preferredTime: e.target.value })}
          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 font-medium"
        >
          <option value="morning">Morning (8am - 12pm)</option>
          <option value="afternoon">Afternoon (12pm - 4pm)</option>
          <option value="evening">Evening (4pm - 8pm)</option>
        </select>
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
          disabled={!isValid()}
          className={`px-6 py-2 rounded-md transition-colors ${
            isValid()
              ? 'bg-primary hover:bg-primary-dark text-white'
              : 'bg-gray-300 cursor-not-allowed text-gray-500'
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default ScheduleDetailsStep;
