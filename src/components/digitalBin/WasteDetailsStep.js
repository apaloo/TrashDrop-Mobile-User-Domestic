import React from 'react';

const WasteDetailsStep = ({ formData, updateFormData, nextStep, prevStep }) => {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Digital Bin Details</h2>
      
      {/* Number of Bins */}
      <div className="mb-5">
        <label htmlFor="numberOfBags" className="block text-sm font-medium text-gray-900 mb-1">
          Number of Digital Bins Needed
        </label>
        <select
          id="numberOfBags"
          value={formData.numberOfBags}
          onChange={(e) => updateFormData({ numberOfBags: e.target.value })}
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
      
      {/* Waste Type */}
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

export default WasteDetailsStep;
