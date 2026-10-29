import React from 'react';

const ScheduleDetailsStep = ({ formData, updateFormData, nextStep, prevStep }) => {
  // What is still missing, so a disabled Continue button explains itself
  const getMissingFields = () => {
    const missing = [];
    if (!formData.frequency) missing.push('service frequency');
    if (!formData.startDate) missing.push('start date');
    if (!formData.preferredTime) missing.push('preferred time');
    return missing;
  };

  // Helper to determine if form is valid
  const isValid = () => getMissingFields().length === 0;

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
      <h2 className="text-xl font-semibold mb-4 text-td-ink">Service Schedule</h2>
      
      {/* Service Frequency - Horizontal Scrollable Cards */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-td-ink mb-2">
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
          <button
            type="button"
            aria-pressed={formData.frequency === 'one-time'}
            onClick={() => updateFormData({ frequency: 'one-time' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.frequency === 'one-time'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-td-cream border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <span className="flex flex-col items-center text-center">
              <span className="block text-3xl mb-2">1️⃣</span>
              <span className={`text-xs font-medium ${
                formData.frequency === 'one-time' ? 'text-green-700' : 'text-td-ink'
              }`}>
                One-time
              </span>
            </span>
          </button>

          {/* Weekly Card */}
          <button
            type="button"
            aria-pressed={formData.frequency === 'weekly'}
            onClick={() => updateFormData({ frequency: 'weekly' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.frequency === 'weekly'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-td-cream border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <span className="flex flex-col items-center text-center">
              <span className="block text-3xl mb-2">📅</span>
              <span className={`text-xs font-medium ${
                formData.frequency === 'weekly' ? 'text-green-700' : 'text-td-ink'
              }`}>
                Weekly
              </span>
            </span>
          </button>

          {/* Bi-weekly Card */}
          <button
            type="button"
            aria-pressed={formData.frequency === 'biweekly'}
            onClick={() => updateFormData({ frequency: 'biweekly' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.frequency === 'biweekly'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-td-cream border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <span className="flex flex-col items-center text-center">
              <span className="block text-3xl mb-2">📆</span>
              <span className={`text-xs font-medium ${
                formData.frequency === 'biweekly' ? 'text-green-700' : 'text-td-ink'
              }`}>
                Bi-weekly
              </span>
            </span>
          </button>

          {/* Monthly Card */}
          <button
            type="button"
            aria-pressed={formData.frequency === 'monthly'}
            onClick={() => updateFormData({ frequency: 'monthly' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.frequency === 'monthly'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-td-cream border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <span className="flex flex-col items-center text-center">
              <span className="block text-3xl mb-2">🗓️</span>
              <span className={`text-xs font-medium ${
                formData.frequency === 'monthly' ? 'text-green-700' : 'text-td-ink'
              }`}>
                Monthly
              </span>
            </span>
          </button>
        </div>
        
        <p className="text-sm text-td-sage mt-2">
          {getFrequencyHelperText()}
        </p>
      </div>
      
      {/* Start Date */}
      <div className="mb-5">
        <label htmlFor="startDate" className="block text-sm font-medium text-td-ink mb-1">
          Pickup Date
        </label>
        <div className="relative">
          <input
            type="date"
            id="startDate"
            value={formData.startDate}
            onChange={handleDateChange}
            className="w-full p-3 border border-td-border-strong rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-td-ink font-medium"
            placeholder="dd/mm/yyyy"
            min={new Date().toISOString().split('T')[0]} // Prevent past dates
            style={{color: '#333'}}
          />
          <div className="absolute top-0 right-0 px-3 py-3 pointer-events-none">
            <svg className="h-5 w-5 text-td-sage" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
      
      {/* Preferred Time - Horizontal Scrollable Cards */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-td-ink mb-2">
          Preferred Pickup Time (not guaranteed)
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
          <button
            type="button"
            aria-pressed={formData.preferredTime === 'morning'}
            onClick={() => updateFormData({ preferredTime: 'morning' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.preferredTime === 'morning'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-td-cream border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <span className="flex flex-col items-center text-center">
              <span className="block text-3xl mb-2">🌅</span>
              <span className={`text-xs font-medium ${
                formData.preferredTime === 'morning' ? 'text-green-700' : 'text-td-ink'
              }`}>
                Morning
              </span>
              <span className="text-[10px] text-td-sage">8am - 12pm</span>
            </span>
          </button>

          {/* Afternoon Card */}
          <button
            type="button"
            aria-pressed={formData.preferredTime === 'afternoon'}
            onClick={() => updateFormData({ preferredTime: 'afternoon' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.preferredTime === 'afternoon'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-td-cream border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <span className="flex flex-col items-center text-center">
              <span className="block text-3xl mb-2">☀️</span>
              <span className={`text-xs font-medium ${
                formData.preferredTime === 'afternoon' ? 'text-green-700' : 'text-td-ink'
              }`}>
                Afternoon
              </span>
              <span className="text-[10px] text-td-sage">12pm - 4pm</span>
            </span>
          </button>

          {/* Evening Card */}
          <button
            type="button"
            aria-pressed={formData.preferredTime === 'evening'}
            onClick={() => updateFormData({ preferredTime: 'evening' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.preferredTime === 'evening'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-td-cream border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <span className="flex flex-col items-center text-center">
              <span className="block text-3xl mb-2">🌆</span>
              <span className={`text-xs font-medium ${
                formData.preferredTime === 'evening' ? 'text-green-700' : 'text-td-ink'
              }`}>
                Evening
              </span>
              <span className="text-[10px] text-td-sage">4pm - 8pm</span>
            </span>
          </button>
        </div>
      </div>
      
      {!isValid() && (
        <p id="schedule-step-missing" className="mt-6 text-sm text-amber-700" role="status">
          Select {getMissingFields().join(', ')} to continue.
        </p>
      )}

      <div className="flex justify-between mt-6">
        <button
          type="button"
          onClick={prevStep}
          className="px-6 py-2 border border-td-border-strong text-td-ink rounded-md hover:bg-td-cream transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={nextStep}
          disabled={!isValid()}
          aria-describedby={isValid() ? undefined : 'schedule-step-missing'}
          className={`px-6 py-2 rounded-md transition-colors ${
            isValid()
              ? 'bg-primary hover:bg-primary-dark text-white'
              : 'bg-gray-300 cursor-not-allowed text-td-sage'
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default ScheduleDetailsStep;
