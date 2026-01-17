import React from 'react';
import { BIN_SIZES, getBinSizeLabel } from '../../utils/costCalculator';

const WasteDetailsStep = ({ formData, updateFormData, nextStep, prevStep }) => {
  // Validation: Bin size is required
  const isValid = () => {
    return formData.numberOfBags && 
           formData.wasteType && 
           formData.bin_size_liters;
  };
  
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Digital Bin Details</h2>
      
      {/* Number of Bins - Horizontal Scrollable Cards */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Number of Digital Bins Needed
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
          {[1, 2, 3, 4, 5].map((num) => (
            <div
              key={num}
              onClick={() => updateFormData({ 
                numberOfBags: String(num),
                bag_count: num
              })}
              className={`flex-shrink-0 w-20 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                parseInt(formData.numberOfBags) === num
                  ? 'bg-green-50 border-2 border-green-500 shadow-md'
                  : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
              }`}
              style={{ scrollSnapAlign: 'start' }}
            >
              <div className="flex flex-col items-center text-center">
                <div className="text-2xl font-bold mb-1" style={{
                  color: parseInt(formData.numberOfBags) === num ? '#15803d' : '#374151'
                }}>
                  {num}
                </div>
                <span className={`text-xs font-medium ${
                  parseInt(formData.numberOfBags) === num ? 'text-green-700' : 'text-gray-700'
                }`}>
                  {num === 1 ? 'Bin' : 'Bins'}
                </span>
              </div>
            </div>
          ))}
        </div>
        
        <p className="text-sm text-gray-500 mt-2">
          Select the number of digital bins you need for your waste collection
        </p>
      </div>
      
      {/* Bin Size - NEW (MANDATORY) */}
      <div className="mb-5">
        <label htmlFor="binSize" className="block text-sm font-medium text-gray-900 mb-1">
          Bin Size (Liters) <span className="text-red-500">*</span>
        </label>
        <select
          id="binSize"
          value={formData.bin_size_liters}
          onChange={(e) => updateFormData({ bin_size_liters: parseInt(e.target.value) })}
          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 font-medium"
          style={{color: '#333'}}
          required
        >
          {BIN_SIZES.map(size => (
            <option key={size} value={size}>
              {getBinSizeLabel(size)}
            </option>
          ))}
        </select>
        <p className="text-sm text-gray-500 mt-1">
          Larger bins cost more but accommodate more waste. Collection cost is calculated based on bin size.
        </p>
      </div>
      
      {/* Waste Type - Horizontal Scrollable Cards */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Bin Type
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
          {/* General Waste Card */}
          <div
            onClick={() => updateFormData({ wasteType: 'general' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.wasteType === 'general'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="text-3xl mb-2">🗑️</div>
              <span className={`text-xs font-medium ${
                formData.wasteType === 'general' ? 'text-green-700' : 'text-gray-700'
              }`}>
                General Waste
              </span>
            </div>
          </div>

          {/* Organic Card */}
          <div
            onClick={() => updateFormData({ wasteType: 'organic' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.wasteType === 'organic'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="text-3xl mb-2">🥬</div>
              <span className={`text-xs font-medium ${
                formData.wasteType === 'organic' ? 'text-green-700' : 'text-gray-700'
              }`}>
                Organic
              </span>
            </div>
          </div>

          {/* Plastic Card */}
          <div
            onClick={() => updateFormData({ wasteType: 'plastic' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.wasteType === 'plastic'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="text-3xl mb-2">🧴</div>
              <span className={`text-xs font-medium ${
                formData.wasteType === 'plastic' ? 'text-green-700' : 'text-gray-700'
              }`}>
                Plastics
              </span>
            </div>
          </div>

          {/* Paper Card */}
          <div
            onClick={() => updateFormData({ wasteType: 'paper' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.wasteType === 'paper'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="text-3xl mb-2">📄</div>
              <span className={`text-xs font-medium ${
                formData.wasteType === 'paper' ? 'text-green-700' : 'text-gray-700'
              }`}>
                Paper
              </span>
            </div>
          </div>

          {/* Glass Card */}
          <div
            onClick={() => updateFormData({ wasteType: 'glass' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.wasteType === 'glass'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="text-3xl mb-2">🫙</div>
              <span className={`text-xs font-medium ${
                formData.wasteType === 'glass' ? 'text-green-700' : 'text-gray-700'
              }`}>
                Glass
              </span>
            </div>
          </div>

          {/* Metal Card */}
          <div
            onClick={() => updateFormData({ wasteType: 'metal' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.wasteType === 'metal'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="text-3xl mb-2">🥫</div>
              <span className={`text-xs font-medium ${
                formData.wasteType === 'metal' ? 'text-green-700' : 'text-gray-700'
              }`}>
                Metal
              </span>
            </div>
          </div>

          {/* Textiles Card */}
          <div
            onClick={() => updateFormData({ wasteType: 'textiles' })}
            className={`flex-shrink-0 w-28 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              formData.wasteType === 'textiles'
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="text-3xl mb-2">👕</div>
              <span className={`text-xs font-medium ${
                formData.wasteType === 'textiles' ? 'text-green-700' : 'text-gray-700'
              }`}>
                Textiles
              </span>
            </div>
          </div>
        </div>
        
        <p className="text-sm text-gray-500 mt-2">
          Swipe to see more options • Choose the type that matches your waste
        </p>
      </div>
      
      {/* Urgent Priority - NEW (OPTIONAL) */}
      <div className="mb-5 bg-yellow-50 p-4 rounded-md border border-yellow-200">
        <div className="flex items-start">
          <input
            id="isUrgent"
            type="checkbox"
            checked={formData.is_urgent}
            onChange={(e) => updateFormData({ is_urgent: e.target.checked })}
            className="h-5 w-5 text-primary focus:ring-primary border-gray-300 rounded mt-0.5"
          />
          <div className="ml-3 flex-1">
            <label htmlFor="isUrgent" className="block text-sm font-medium text-gray-900">
              ⚡ Mark as Urgent
            </label>
            <p className="text-sm text-gray-600 mt-1">
              Check this box to prioritize your request. Urgent pickups are processed first and may incur an additional fee (+30%). It takes up to 2 hours for urgent pickup to be collected.
            </p>
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

export default WasteDetailsStep;
