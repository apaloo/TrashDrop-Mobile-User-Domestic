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
      case 'one-time':
        return 'Your digital bin will be serviced once on the scheduled date';
      case 'weekly':
        return 'Your digital bin will be serviced every week on the same day';
      case 'biweekly':
        return 'Your digital bin will be serviced every two weeks on the same day';
      case 'monthly':
        return 'Your digital bin will be serviced once a month on the same date';
      default:
        return '';
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Service Schedule</h2>
      
      {/* Service Frequency - Horizontal Scrollable Cards */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Service Frequency
        </label>
        
        {/* Horizontal scrollable container */}
        <div 
          className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1"
          style={{
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
        >
          {/* One-time Card */}
          <div
            onClick={() => updateFormData({ frequency: 'one-time' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.frequency === 'one-time'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="text-3xl mb-2">1️⃣</div>
              <span className={`text-xs font-medium ${
                formData.frequency === 'one-time' ? 'text-green-700' : 'text-gray-700'
              }`}>
                One-time
              </span>
            </div>
          </div>

          {/* Weekly Card */}
          <div
            onClick={() => updateFormData({ frequency: 'weekly' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.frequency === 'weekly'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="text-3xl mb-2">📅</div>
              <span className={`text-xs font-medium ${
                formData.frequency === 'weekly' ? 'text-green-700' : 'text-gray-700'
              }`}>
                Weekly
              </span>
            </div>
          </div>

          {/* Bi-weekly Card */}
          <div
            onClick={() => updateFormData({ frequency: 'biweekly' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.frequency === 'biweekly'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="text-3xl mb-2">📆</div>
              <span className={`text-xs font-medium ${
                formData.frequency === 'biweekly' ? 'text-green-700' : 'text-gray-700'
              }`}>
                Bi-weekly
              </span>
            </div>
          </div>

          {/* Monthly Card */}
          <div
            onClick={() => updateFormData({ frequency: 'monthly' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.frequency === 'monthly'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="text-3xl mb-2">🗓️</div>
              <span className={`text-xs font-medium ${
                formData.frequency === 'monthly' ? 'text-green-700' : 'text-gray-700'
              }`}>
                Monthly
              </span>
            </div>
          </div>
        </div>
        
        <p className="text-sm text-gray-500 mt-2">
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
            style={{color: '#333'}}
          />
          <div className="absolute top-0 right-0 px-3 py-3 pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
      
      {/* Preferred Time - Horizontal Scrollable Cards */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Preferred Service Time (not guaranteed)
        </label>
        
        {/* Horizontal scrollable container */}
        <div 
          className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1"
          style={{
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
        >
          {/* Morning Card */}
          <div
            onClick={() => updateFormData({ preferredTime: 'morning' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.preferredTime === 'morning'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="text-3xl mb-2">🌅</div>
              <span className={`text-xs font-medium ${
                formData.preferredTime === 'morning' ? 'text-green-700' : 'text-gray-700'
              }`}>
                Morning
              </span>
              <span className="text-[10px] text-gray-400">8am - 12pm</span>
            </div>
          </div>

          {/* Afternoon Card */}
          <div
            onClick={() => updateFormData({ preferredTime: 'afternoon' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.preferredTime === 'afternoon'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="text-3xl mb-2">☀️</div>
              <span className={`text-xs font-medium ${
                formData.preferredTime === 'afternoon' ? 'text-green-700' : 'text-gray-700'
              }`}>
                Afternoon
              </span>
              <span className="text-[10px] text-gray-400">12pm - 4pm</span>
            </div>
          </div>

          {/* Evening Card */}
          <div
            onClick={() => updateFormData({ preferredTime: 'evening' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.preferredTime === 'evening'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="text-3xl mb-2">🌆</div>
              <span className={`text-xs font-medium ${
                formData.preferredTime === 'evening' ? 'text-green-700' : 'text-gray-700'
              }`}>
                Evening
              </span>
              <span className="text-[10px] text-gray-400">4pm - 8pm</span>
            </div>
          </div>
        </div>
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
