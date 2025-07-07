import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LocationStep from '../components/schedulePickup/LocationStep';
import ScheduleDetailsStep from '../components/schedulePickup/ScheduleDetailsStep';
import WasteDetailsStep from '../components/schedulePickup/WasteDetailsStep';
import AdditionalInfoStep from '../components/schedulePickup/AdditionalInfoStep';
import ReviewStep from '../components/schedulePickup/ReviewStep';

/**
 * Multi-step form for scheduling recurring pickup
 */
const SchedulePickup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Current step of the form
  const [currentStep, setCurrentStep] = useState(1);
  
  // Form data state
  const [formData, setFormData] = useState({
    // Location details
    address: '',
    useCurrentLocation: false,
    latitude: null,
    longitude: null,
    
    // Schedule details
    frequency: 'weekly',
    startDate: '',
    preferredTime: 'morning',
    
    // Waste details
    numberOfBags: '1',
    wasteType: 'general',
    
    // Additional info
    notes: '',
  });
  
  // Progress indicator helper
  const getStepTitle = (step) => {
    switch (step) {
      case 1: return 'Pickup Location';
      case 2: return 'Schedule Details';
      case 3: return 'Waste Details';
      case 4: return 'Additional Info';
      case 5: return 'Review & Submit';
      default: return '';
    }
  };
  
  // Handler for moving to next step
  const nextStep = () => {
    setCurrentStep(currentStep + 1);
    window.scrollTo(0, 0);
  };
  
  // Handler for moving to previous step
  const prevStep = () => {
    setCurrentStep(currentStep - 1);
    window.scrollTo(0, 0);
  };
  
  // Handler for updating form data
  const updateFormData = (newData) => {
    setFormData(prev => ({
      ...prev,
      ...newData
    }));
  };
  
  // Handler for form submission
  const handleSubmit = async () => {
    // In a real application, this would make an API call to save the pickup
    console.log('Submitting form data:', formData);
    
    // Navigate to dashboard after successful submission
    setTimeout(() => {
      navigate('/dashboard');
    }, 2000);
  };
  
  // Main render
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Schedule Pickup</h1>
      
      {/* Step indicators */}
      <div className="mb-6 flex items-center justify-between">
        {[1, 2, 3, 4, 5].map(step => (
          <div 
            key={step}
            className={`flex flex-col items-center ${currentStep === step ? 'opacity-100' : 'opacity-60'}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1
              ${currentStep >= step ? 'bg-primary text-white' : 'bg-gray-200 text-gray-600'}`}>
              {step}
            </div>
            <span className="text-xs text-center hidden md:block">{getStepTitle(step)}</span>
          </div>
        ))}
      </div>
      
      {/* Form steps */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        {currentStep === 1 && (
          <LocationStep 
            formData={formData}
            updateFormData={updateFormData}
            nextStep={nextStep}
          />
        )}
        
        {currentStep === 2 && (
          <ScheduleDetailsStep 
            formData={formData}
            updateFormData={updateFormData}
            nextStep={nextStep}
            prevStep={prevStep}
          />
        )}
        
        {currentStep === 3 && (
          <WasteDetailsStep 
            formData={formData}
            updateFormData={updateFormData}
            nextStep={nextStep}
            prevStep={prevStep}
          />
        )}
        
        {currentStep === 4 && (
          <AdditionalInfoStep 
            formData={formData}
            updateFormData={updateFormData}
            nextStep={nextStep}
            prevStep={prevStep}
          />
        )}
        
        {currentStep === 5 && (
          <ReviewStep 
            formData={formData}
            prevStep={prevStep}
            handleSubmit={handleSubmit}
          />
        )}
      </div>
      
      {/* Link to one-time pickup */}
      {currentStep === 5 && (
        <div className="text-center mt-4">
          <a href="/pickup-request" className="text-primary hover:underline">
            Need a one-time pickup? Request here
          </a>
        </div>
      )}
    </div>
  );
};

export default SchedulePickup;
