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
      
      {/* Number of Bins - EXISTING */}
      <div className="mb-5">
        <label htmlFor="numberOfBags" className="block text-sm font-medium text-gray-900 mb-1">
          Number of Digital Bins Needed
        </label>
        <select
          id="numberOfBags"
          value={formData.numberOfBags}
          onChange={(e) => updateFormData({ 
            numberOfBags: e.target.value,
            bag_count: parseInt(e.target.value)  // Sync with bag_count field
          })}
          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 font-medium"
          style={{color: '#333'}}
        >
          <option value="1">1 Bin</option>
          <option value="2">2 Bins</option>
          <option value="3">3 Bins</option>
          <option value="4">4 Bins</option>
          <option value="5">5 Bins</option>
        </select>
        <p className="text-sm text-gray-500 mt-1">
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
      
      {/* Waste Type - EXISTING */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Bin Type
        </label>
        
        <div className="space-y-3">
          {/* General Waste */}
          <div className="flex items-center">
            <input
              id="waste-general"
              name="wasteType"
              type="radio"
              checked={formData.wasteType === 'general'}
              onChange={() => updateFormData({ wasteType: 'general' })}
              className="h-5 w-5 text-primary focus:ring-primary border-gray-300"
            />
            <label htmlFor="waste-general" className="ml-3 block text-sm font-medium text-gray-900">
              General Waste Bin
            </label>
          </div>
          
          {/* Recycling */}
          <div className="flex items-center">
            <input
              id="waste-recycling"
              name="wasteType"
              type="radio"
              checked={formData.wasteType === 'recycling'}
              onChange={() => updateFormData({ wasteType: 'recycling' })}
              className="h-5 w-5 text-primary focus:ring-primary border-gray-300"
            />
            <label htmlFor="waste-recycling" className="ml-3 block text-sm font-medium text-gray-900">
              Recycling Bin
            </label>
          </div>
          
          {/* Organic Waste */}
          <div className="flex items-center">
            <input
              id="waste-organic"
              name="wasteType"
              type="radio"
              checked={formData.wasteType === 'organic'}
              onChange={() => updateFormData({ wasteType: 'organic' })}
              className="h-5 w-5 text-primary focus:ring-primary border-gray-300"
            />
            <label htmlFor="waste-organic" className="ml-3 block text-sm font-medium text-gray-900">
              Organic Waste Bin
            </label>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Choose the type of bin that matches your waste collection needs
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
              Check this box to prioritize your request. Urgent pickups are processed first and may incur an additional fee (+10%).
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
