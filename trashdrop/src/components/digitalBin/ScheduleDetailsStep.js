import React from 'react';
import OptionTile from '../ui/OptionTile.js';
import StepNav from './StepNav.js';
import { card, fieldHint, inputField, sectionTitle } from '../ui/styles.js';

// Choices on the step: [value, icon, label(, hint)]
const FREQUENCY_OPTIONS = [
  ['one-time', '1️⃣', 'One-time'],
  ['weekly', '📅', 'Weekly'],
  ['biweekly', '📆', 'Bi-weekly'],
  ['monthly', '🗓️', 'Monthly']
];

const TIME_OPTIONS = [
  ['morning', '🌅', 'Morning', '8am - 12pm'],
  ['afternoon', '☀️', 'Afternoon', '12pm - 4pm'],
  ['evening', '🌆', 'Evening', '4pm - 8pm']
];

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
        return 'We collect once, on the date you choose.';
      case 'weekly':
        return "This books the first collection. We'll remind you in the app the day before each weekly collection after it, so you can book it in a few taps.";
      case 'biweekly':
        return "This books the first collection. We'll remind you in the app the day before each collection every two weeks after it, so you can book it in a few taps.";
      case 'monthly':
        return "This books the first collection. We'll remind you in the app the day before the same date each month, so you can book it in a few taps.";
      default:
        return '';
    }
  };

  return (
    <div>
      <section className={`${card} px-4 py-4 space-y-5`}>
        <h2 className={sectionTitle}>Service Schedule</h2>

        <div role="group" aria-labelledby="bin-frequency">
          <p id="bin-frequency" className="text-[15px] font-semibold text-td-ink dark:text-gray-100 mb-2.5">
            Service Frequency
          </p>
          <div className="grid grid-cols-2 min-[400px]:grid-cols-4 gap-2">
            {FREQUENCY_OPTIONS.map(([value, icon, label]) => (
              <OptionTile
                key={value}
                selected={formData.frequency === value}
                onClick={() => updateFormData({ frequency: value })}
                icon={icon}
                label={label}
              />
            ))}
          </div>
          {getFrequencyHelperText() && (
            <p className={`${fieldHint} mt-2`}>{getFrequencyHelperText()}</p>
          )}
        </div>

        <div>
          <label htmlFor="startDate" className="block text-[15px] font-semibold text-td-ink dark:text-gray-100 mb-1.5">
            Pickup Date
          </label>
          <input
            type="date"
            id="startDate"
            value={formData.startDate}
            onChange={handleDateChange}
            className={inputField}
            placeholder="dd/mm/yyyy"
            min={new Date().toISOString().split('T')[0]} // Prevent past dates
          />
        </div>

        <div role="group" aria-labelledby="bin-time">
          <p id="bin-time" className="text-[15px] font-semibold text-td-ink dark:text-gray-100 mb-2.5">
            Preferred Pickup Time <span className="font-normal text-td-sage dark:text-gray-300">(not guaranteed)</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            {TIME_OPTIONS.map(([value, icon, label, hint]) => (
              <OptionTile
                key={value}
                selected={formData.preferredTime === value}
                onClick={() => updateFormData({ preferredTime: value })}
                icon={icon}
                label={label}
                hint={hint}
              />
            ))}
          </div>
        </div>
      </section>

      <StepNav
        onBack={prevStep}
        onNext={nextStep}
        disabled={!isValid()}
        missing={getMissingFields()}
        missingId="schedule-step-missing"
      />
    </div>
  );
};

export default ScheduleDetailsStep;
