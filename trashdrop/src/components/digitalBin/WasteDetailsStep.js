import React from 'react';
import { BIN_SIZES, getBinSizeLabel } from '../../utils/costCalculator';
import OptionTile from '../ui/OptionTile.js';
import StepNav from './StepNav.js';
import { card, fieldHint, infoNote, inputField, sectionTitle, warningNote } from '../ui/styles.js';

// Waste types accepted by the digital_bins CHECK constraint
const WASTE_TYPES = [
  { value: 'general', label: 'General Waste', icon: '🗑️' },
  { value: 'recycling', label: 'Recycling', icon: '♻️' },
  { value: 'organic', label: 'Organic Waste', icon: '🥬' }
];

const BIN_COUNTS = [1, 2, 3, 4, 5];

const WasteDetailsStep = ({ formData, updateFormData, nextStep, prevStep, promoState = {} }) => {
  // What is still missing, so a disabled Continue button explains itself
  const getMissingFields = () => {
    const missing = [];
    if (!formData.numberOfBags) missing.push('number of bins');
    if (!formData.wasteType) missing.push('waste type');
    if (!formData.bin_size_liters) missing.push('bin size');
    return missing;
  };

  // Validation: Bin size is required
  const isValid = () => getMissingFields().length === 0;
  
  return (
    <div className="space-y-4">
      <section className={`${card} px-4 py-4 space-y-5`}>
        <h2 className={sectionTitle}>Digital Bin Details</h2>

        <div role="group" aria-labelledby="bin-count">
          <p id="bin-count" className="text-[15px] font-semibold text-td-ink dark:text-gray-100 mb-2.5">
            Number of Digital Bins Needed
          </p>
          <div className="grid grid-cols-5 gap-2">
            {BIN_COUNTS.map((num) => {
              const selected = parseInt(formData.numberOfBags) === num;
              return (
                <button
                  type="button"
                  key={num}
                  aria-pressed={selected}
                  onClick={() => updateFormData({ 
                    numberOfBags: String(num),
                    bag_count: num
                  })}
                  className={`min-w-0 rounded-2xl border-2 py-2.5 flex flex-col items-center transition-colors ${
                    selected
                      ? 'border-td-forest bg-td-tonal dark:border-green-400 dark:bg-green-900/40'
                      : 'border-td-border bg-white hover:border-td-border-strong dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-400'
                  }`}
                >
                  <span className={`text-[22px] leading-none font-bold ${selected ? 'text-td-forest-dk dark:text-green-300' : 'text-td-ink dark:text-gray-100'}`}>
                    {num}
                  </span>
                  <span className="text-xs text-td-sage dark:text-gray-300 mt-1">{num === 1 ? 'Bin' : 'Bins'}</span>
                </button>
              );
            })}
          </div>
          <p className={`${fieldHint} mt-2`}>
            Select the number of digital bins you need for your waste collection
          </p>
        </div>

        <div>
          <label htmlFor="binSize" className="block text-[15px] font-semibold text-td-ink dark:text-gray-100 mb-1.5">
            Bin Size (Liters) <span className="text-td-error" aria-hidden="true">*</span>
          </label>
          <select
            id="binSize"
            value={formData.bin_size_liters}
            onChange={(e) => updateFormData({ bin_size_liters: parseInt(e.target.value) })}
            className={inputField}
            required
          >
            {BIN_SIZES.map(size => (
              <option key={size} value={size}>
                {getBinSizeLabel(size)}
              </option>
            ))}
          </select>
          <p className={`${fieldHint} mt-1.5`}>
            Larger bins cost more but accommodate more waste. Collection cost is calculated based on bin size.
          </p>
        </div>

        <div role="group" aria-labelledby="bin-type">
          <p id="bin-type" className="text-[15px] font-semibold text-td-ink dark:text-gray-100 mb-2.5">
            Bin Type
          </p>
          <div className="grid grid-cols-3 gap-2">
            {WASTE_TYPES.map(({ value, label, icon }) => (
              <OptionTile
                key={value}
                selected={formData.wasteType === value}
                onClick={() => updateFormData({ wasteType: value, waste_type: value })}
                icon={icon}
                label={label}
              />
            ))}
          </div>
          <p className={`${fieldHint} mt-2`}>
            Choose the type that matches your waste
          </p>
        </div>
      </section>
      
      {/* Promotional pricing indicator */}
      {promoState?.isEligible && (
        <div className={`${infoNote} px-4 py-3 flex items-start gap-3`}>
          <span className="text-lg leading-none mt-0.5" aria-hidden="true">🎁</span>
          <div className="text-sm">
            <p className="font-semibold">Promotional pricing active</p>
            <p className="mt-0.5">
              {promoState.maxRequests - promoState.usedCount} of {promoState.maxRequests} discounted pickups remaining
            </p>
            <p className="mt-0.5">Promotional price per bin; not for urgent pickups.</p>
          </div>
        </div>
      )}

      {/* Urgent Priority - NEW (OPTIONAL) */}
      <div className={`${warningNote} px-4 py-3.5 flex items-start gap-3`}>
        <input
          id="isUrgent"
          type="checkbox"
          checked={formData.is_urgent}
          onChange={(e) => updateFormData({ is_urgent: e.target.checked })}
          className="h-5 w-5 mt-0.5 rounded border-td-border-strong text-td-forest focus:ring-td-forest flex-shrink-0"
        />
        <div className="flex-1">
          <label htmlFor="isUrgent" className="block text-[15px] font-semibold">
            ⚡ Mark as Urgent
          </label>
          <p className="text-sm mt-1">
            Check this box to prioritize your request. Urgent pickups are processed first and may incur an additional fee (+30%). It takes up to 2 hours for urgent pickup to be collected.
          </p>
        </div>
      </div>

      <StepNav
        onBack={prevStep}
        onNext={nextStep}
        disabled={!isValid()}
        missing={getMissingFields()}
        missingId="waste-step-missing"
      />
    </div>
  );
};

export default WasteDetailsStep;
