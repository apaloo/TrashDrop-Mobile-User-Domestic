/**
 * Onboarding Flow Component
 * Implements the complete onboarding experience using existing infrastructure
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import onboardingService from '../services/onboardingService.js';
import supabase from '../utils/supabaseClient.js';

const OnboardingFlow = ({ onComplete, onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Flow state
  const [currentStep, setCurrentStep] = useState('welcome');
  const [userState, setUserState] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Handle dismissing onboarding permanently
  const handleDismiss = () => {
    console.log('[OnboardingFlow] User dismissing onboarding permanently');
    if (user?.id) {
      onboardingService.dismissOnboarding(user.id);
    }
    onClose();
  };
  
  // Form data
  const [hasBags, setHasBags] = useState(null);
  const [location, setLocation] = useState(null);
  const [qrCode, setQrCode] = useState('');
  const [selectedService, setSelectedService] = useState(null);

  // Initialize onboarding
  useEffect(() => {
    const initializeOnboarding = async () => {
      if (!user?.id) return;
      
      try {
        setIsLoading(true);
        
        // Start onboarding tracking
        await onboardingService.startOnboarding(user.id);
        
        // Check if user is returning from location setup (check first!)
        const locationSaved = localStorage.getItem('trashdrop_location_saved');
        console.log('[Onboarding] DEBUG: Checking locationSaved flag:', locationSaved);
        console.log('[Onboarding] DEBUG: Current URL:', window.location.href);
        console.log('[Onboarding] DEBUG: User ID:', user?.id);
        
        if (locationSaved === 'true') {
          // User just saved a location, continue to next step
          // Clear the flag
          localStorage.removeItem('trashdrop_location_saved');
          
          // First, ensure a location is actually saved in the database
          try {
            console.log('[Onboarding] Processing location-saved action');
            
            // Check if user already has locations
            const { data: existingLocations } = await supabase
              .from('bin_locations')
              .select('id')
              .eq('user_id', user.id)
              .limit(1);
            
            if (!existingLocations || existingLocations.length === 0) {
              console.log('[Onboarding] No locations found, creating default location');
              // Create a default location since none exists
              await onboardingService.addUserLocation(
                user.id,
                'Home',
                'Default location from onboarding',
                0, // Default coordinates
                0
              );
            }
            
            // Try to get their "has bags" selection from database
            const { data: bagsSelection } = await onboardingService.getUserHasBagsSelection(user.id);
            console.log('[Onboarding] User bags selection:', bagsSelection);
            
            if (bagsSelection?.selection_made) {
              setHasBags(bagsSelection.has_bags);
              setCurrentStep(bagsSelection.has_bags ? 'scan_qr' : 'digital_bin');
            } else {
              // No selection made, check if we can determine from localStorage
              const hasBagsLocal = localStorage.getItem(`trashdrop_has_bags_${user.id}`);
              if (hasBagsLocal !== null) {
                setHasBags(hasBagsLocal === 'true');
                setCurrentStep(hasBagsLocal === 'true' ? 'scan_qr' : 'digital_bin');
              } else {
                // Default to welcome step
                setCurrentStep('welcome');
              }
            }
          } catch (error) {
            console.error('[Onboarding] Error processing location-saved:', error);
            // Network error - check localStorage as fallback
            const hasBagsLocal = localStorage.getItem(`trashdrop_has_bags_${user.id}`);
            if (hasBagsLocal !== null) {
              setHasBags(hasBagsLocal === 'true');
              setCurrentStep(hasBagsLocal === 'true' ? 'scan_qr' : 'digital_bin');
            } else {
              // Default to welcome step
              setCurrentStep('welcome');
            }
          }
        } else {
          // Normal flow - get current user state
          const state = await onboardingService.getUserState(user.id);
          setUserState(state);
          
          // Determine starting step
          if (state.state === 'NEW_USER') {
            setCurrentStep('welcome');
          } else if (state.state === 'LOCATION_SET') {
            // User has a location but no bags yet
            // Try to get their "has bags" selection from database
            try {
              const { data: bagsSelection } = await onboardingService.getUserHasBagsSelection(user.id);
              console.log('[Onboarding] User bags selection:', bagsSelection);
              
              if (bagsSelection?.selection_made) {
                setHasBags(bagsSelection.has_bags);
                setCurrentStep(bagsSelection.has_bags ? 'scan_qr' : 'digital_bin');
              } else {
                // No selection made, check if we can determine from localStorage
                const hasBagsLocal = localStorage.getItem(`trashdrop_has_bags_${user.id}`);
                if (hasBagsLocal !== null) {
                  setHasBags(hasBagsLocal === 'true');
                  setCurrentStep(hasBagsLocal === 'true' ? 'scan_qr' : 'digital_bin');
                } else {
                  // Default to welcome step
                  setCurrentStep('welcome');
                }
              }
            } catch (error) {
              console.error('[Onboarding] Error getting bags selection:', error);
              // Network error - check localStorage as fallback
              const hasBagsLocal = localStorage.getItem(`trashdrop_has_bags_${user.id}`);
              if (hasBagsLocal !== null) {
                setHasBags(hasBagsLocal === 'true');
                setCurrentStep(hasBagsLocal === 'true' ? 'scan_qr' : 'digital_bin');
              } else {
                // Default to welcome step
                setCurrentStep('welcome');
              }
            }
          } else if (state.state === 'BAGS_READY') {
            // User has bags and location, ready for QR scan
            setCurrentStep('scan_qr');
          } else if (state.state === 'QR_SCANNED') {
            // User has completed QR scan
            setCurrentStep('digital_bin');
          } else {
            // Default to welcome
            setCurrentStep('welcome');
          }
        }
        
      } catch (error) {
        console.error('[Onboarding] Initialization error:', error);
        setError('Failed to initialize onboarding');
      } finally {
        setIsLoading(false);
      }
    };
    
    initializeOnboarding();
  }, [user?.id]);

  const handleHasBags = async (hasBags) => {
    try {
      setIsLoading(true);
      setHasBags(hasBags);
      
      // Save to localStorage as fallback for network issues
      localStorage.setItem(`trashdrop_has_bags_${user.id}`, hasBags.toString());
      
      await onboardingService.setHasBags(user.id, hasBags);
      
      if (hasBags) {
        // Navigate to Profile & Settings page, locations tab
        navigate('/profile?tab=locations&source=onboarding');
        onComplete(); // Close onboarding modal
      } else {
        setCurrentStep('choose_service');
      }
      
    } catch (error) {
      console.error('[Onboarding] Error setting has bags:', error);
      setError('Failed to save selection');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocationSet = async (locationData) => {
    try {
      setIsLoading(true);
      setLocation(locationData);
      
      const locationId = await onboardingService.addUserLocation(
        user.id,
        locationData.name,
        locationData.address,
        locationData.latitude,
        locationData.longitude
      );
      
      if (hasBags) {
        setCurrentStep('scan_qr');
      } else {
        setCurrentStep('digital_bin');
      }
      
    } catch (error) {
      console.error('[Onboarding] Error setting location:', error);
      setError('Failed to save location');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQRScan = async (scannedCode) => {
    try {
      setIsLoading(true);
      setQrCode(scannedCode);
      
      const result = await onboardingService.processQRScan(user.id, scannedCode);
      
      if (result.error) {
        setError('Invalid QR code. Please try again.');
        return;
      }
      
      setCurrentStep('request_pickup');
      
    } catch (error) {
      console.error('[Onboarding] Error processing QR:', error);
      setError('Failed to process QR code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleServiceSelection = async (service) => {
    try {
      setIsLoading(true);
      setSelectedService(service);
      
      if (service === 'digital_bin') {
        // Navigate to the actual Digital Bin page
        navigate('/digital-bin?source=onboarding');
        onComplete();
      } else if (service === 'buy_bags') {
        // Navigate to bag purchase
        navigate('/bags?source=onboarding');
        onComplete();
      } else if (service === 'report') {
        // Navigate to reporting
        navigate('/report?source=onboarding');
        onComplete();
      }
      
    } catch (error) {
      console.error('[Onboarding] Error selecting service:', error);
      setError('Failed to select service');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDigitalBinCreation = async (fee) => {
    try {
      setIsLoading(true);
      console.log('[Onboarding] Creating digital bin with fee:', fee);
      
      // Use default location if no location is set (for simplified onboarding flow)
      const locationId = location?.id || 'default-location-id';
      
      const binId = await onboardingService.createDigitalBin(
        user.id,
        locationId,
        fee
      );
      
      console.log('[Onboarding] Digital bin created successfully:', binId);
      setCurrentStep('success');
      
    } catch (error) {
      console.error('[Onboarding] Error creating digital bin:', error);
      setError('Failed to create digital bin');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePickupRequest = async () => {
    try {
      setIsLoading(true);
      
      // Check if user is available
      if (!user?.id) {
        throw new Error('User not authenticated');
      }
      
      // Check if location is available
      if (!location?.id) {
        throw new Error('Location not selected');
      }
      
      await onboardingService.createOnboardingPickup(
        user.id,
        location.id,
        1 // Default bag count for onboarding
      );
      
      setCurrentStep('success');
      
    } catch (error) {
      console.error('[Onboarding] Error creating pickup:', error);
      setError(error.message || 'Failed to request pickup');
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = () => {
    onComplete();
    navigate('/dashboard');
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return <WelcomeStep onHasBags={handleHasBags} onServiceSelect={handleServiceSelection} isLoading={isLoading} />;
        
      case 'choose_service':
        return <ChooseServiceStep onServiceSelect={handleServiceSelection} isLoading={isLoading} />;
        
      case 'location':
        return <LocationStep onLocationSet={handleLocationSet} isLoading={isLoading} />;
        
      case 'scan_qr':
        return <QRScanStep onScanComplete={handleQRScan} isLoading={isLoading} />;
        
      case 'digital_bin':
        return <DigitalBinStep onBinCreate={handleDigitalBinCreation} location={location} isLoading={isLoading} />;
        
      case 'request_pickup':
        return <PickupRequestStep onPickupRequest={handlePickupRequest} isLoading={isLoading} />;
        
      case 'success':
        return <SuccessStep onComplete={handleComplete} />;
        
      default:
        return <WelcomeStep onHasBags={handleHasBags} onServiceSelect={handleServiceSelection} isLoading={isLoading} />;
    }
  };

  if (error) {
    console.log('[OnboardingFlow] Rendering error state:', error);
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md mx-4">
          <h3 className="text-lg font-semibold text-red-600 mb-2">Error</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  console.log('[OnboardingFlow] Rendering main modal with step:', currentStep);
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" style={{zIndex: 9999}}>
      <div className="bg-white rounded-lg max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900 antialiased">
              {currentStep === 'success' ? 'Welcome to TrashDrop!' : 'Complete Your Setup'}
            </h2>
            <div className="flex items-center space-x-2">
              {/* Dismiss button - available for all users */}
              <button
                onClick={handleDismiss}
                className="text-xs text-gray-500 hover:text-gray-700 underline antialiased"
                title="Don't show this again"
              >
                Dismiss
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold antialiased"
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>
          
          {/* Progress indicator */}
          {currentStep !== 'success' && (
            <div className="mt-4">
              <div className="flex items-center">
                <div className={`flex-1 h-2 rounded-full ${
                  ['welcome', 'choose_service'].includes(currentStep) ? 'bg-blue-600' : 'bg-gray-200'
                }`} />
                <div className={`flex-1 h-2 rounded-full mx-1 ${
                  ['location'].includes(currentStep) ? 'bg-blue-600' : 'bg-gray-200'
                }`} />
                <div className={`flex-1 h-2 rounded-full ${
                  ['scan_qr', 'digital_bin'].includes(currentStep) ? 'bg-blue-600' : 'bg-gray-200'
                }`} />
                <div className={`flex-1 h-2 rounded-full ml-1 ${
                  ['request_pickup', 'success'].includes(currentStep) ? 'bg-blue-600' : 'bg-gray-200'
                }`} />
              </div>
            </div>
          )}
        </div>
        
        {/* Content */}
        <div className="p-6 antialiased">
          {renderStep()}
        </div>
      </div>
    </div>
  );
};

// Step Components
const WelcomeStep = ({ onHasBags, onServiceSelect, isLoading }) => (
  <div className="text-center antialiased">
    <div className="mb-6">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-3xl">🗑️</span>
      </div>
      <h3 className="text-lg font-semibold mb-2 text-gray-900 antialiased">Start Your First Cleanup</h3>
      <p className="text-gray-600 antialiased leading-relaxed">Do you have TrashDrop bags ready to use?</p>
    </div>
    
    <div className="space-y-3">
      <button
        onClick={() => onHasBags(true)}
        disabled={isLoading}
        className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium antialiased"
      >
        Yes, I have bags
      </button>
      
      <button
        onClick={() => onHasBags(false)}
        disabled={isLoading}
        className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium antialiased"
      >
        No, I don't have bags
      </button>
    </div>
    
    <div className="mt-6 pt-6 border-t">
      <p className="text-sm text-gray-500 mb-3 antialiased">Other options:</p>
      <div className="space-y-2">
        <button 
          onClick={() => onServiceSelect('report')}
          disabled={isLoading}
          className="w-full px-4 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 font-medium antialiased"
        >
          Report Illegal Dumping
        </button>
      </div>
    </div>
  </div>
);

const ChooseServiceStep = ({ onServiceSelect, isLoading }) => (
  <div className="antialiased">
    <h3 className="text-lg font-semibold mb-4 text-gray-900 antialiased">Choose Your Service</h3>
    <p className="text-gray-600 mb-6 antialiased leading-relaxed">Select how you'd like to get started with TrashDrop</p>
    
    <div className="space-y-3">
      <button
        onClick={() => onServiceSelect('digital_bin')}
        disabled={isLoading}
        className="w-full p-4 border border-blue-600 rounded-lg hover:bg-blue-50 text-left disabled:opacity-50 antialiased h-20"
      >
        <div className="flex items-center h-full">
          <span className="text-2xl mr-3">🗑️</span>
          <div>
            <h4 className="font-semibold text-gray-900 antialiased">Create Digital Bin</h4>
            <p className="text-sm text-gray-600 antialiased">Request for waste pickup instantly or on schedule</p>
          </div>
        </div>
      </button>
      
      <button
        onClick={() => onServiceSelect('report')}
        disabled={isLoading}
        className="w-full p-4 border border-orange-600 rounded-lg hover:bg-orange-50 text-left disabled:opacity-50 antialiased h-20"
      >
        <div className="flex items-center h-full">
          <span className="text-2xl mr-3">📸</span>
          <div>
            <h4 className="font-semibold text-gray-900 antialiased">Report Illegal Dumping</h4>
            <p className="text-sm text-gray-600 antialiased">Help keep your community clean</p>
          </div>
        </div>
      </button>
      
      <button
        onClick={() => onServiceSelect('order_bag')}
        disabled={true} // This button is inactive as requested
        className="w-full p-4 border border-gray-300 rounded-lg text-left opacity-50 cursor-not-allowed antialiased h-20"
      >
        <div className="flex items-center h-full">
          <span className="text-2xl mr-3">🛍️</span>
          <div>
            <h4 className="font-semibold text-gray-900 antialiased">Order for your Trashdrop bag</h4>
            <p className="text-sm text-gray-600 antialiased">to enjoy free pickup</p>
          </div>
        </div>
      </button>
    </div>
  </div>
);

const LocationStep = ({ onLocationSet, isLoading }) => {
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
  const handleGetCurrentLocation = () => {
    setIsGettingLocation(true);
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          // Create location data
          const locationData = {
            name: 'Home',
            address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
            latitude,
            longitude
          };
          
          onLocationSet(locationData);
          setIsGettingLocation(false);
        },
        (error) => {
          console.error('Geolocation error:', error);
          setIsGettingLocation(false);
          // Fallback to manual entry
        }
      );
    }
  };
  
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Set Your Location</h3>
      <p className="text-gray-600 mb-6">We need your location to provide pickup service</p>
      
      <button
        onClick={handleGetCurrentLocation}
        disabled={isLoading || isGettingLocation}
        className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {isGettingLocation ? 'Getting Location...' : '📍 Use My Current Location'}
      </button>
      
      <div className="mt-4 text-center">
        <button 
          onClick={() => {
            // Create a fallback location for manual entry
            const locationData = {
              name: 'Home',
              address: 'Manual entry - Please update in profile',
              latitude: 0, // Default coordinates
              longitude: 0
            };
            onLocationSet(locationData);
          }}
          className="text-blue-600 hover:text-blue-700 text-sm"
        >
          Enter Location Manually
        </button>
      </div>
    </div>
  );
};

const QRScanStep = ({ onScanComplete, isLoading }) => {
  const [scanning, setScanning] = useState(false);
  const navigate = useNavigate();
  
  const handleScan = (code) => {
    setScanning(false);
    onScanComplete(code);
  };

  const handleStartScanning = () => {
    console.log('[QRScanStep] Navigate to QR Scanner page with auto-start');
    navigate('/qr-scanner?auto_start=true&source=onboarding');
  };
  
  return (
    <div className="antialiased">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 antialiased">Scan Your Bag QR Code</h3>
      <p className="text-gray-600 mb-6 antialiased leading-relaxed">Scan the Batch QR code on the bundled trashdrop bags</p>
      
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <div className="text-4xl mb-4">📷</div>
        <p className="text-gray-600 mb-4 antialiased">QR Scanner</p>
        <button
          onClick={handleStartScanning}
          disabled={isLoading || scanning}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-medium antialiased"
        >
          {scanning ? 'Scanning...' : 'Start Scanning'}
        </button>
      </div>
      
      <div className="mt-4">
        <input
          type="text"
          placeholder="Or enter QR code manually"
          className="w-full px-3 py-2 border rounded-lg antialiased"
          onKeyPress={(e) => {
            if (e.key === 'Enter' && e.target.value) {
              handleScan(e.target.value);
            }
          }}
        />
      </div>
    </div>
  );
};

const DigitalBinStep = ({ onBinCreate, location, isLoading }) => {
  const [fee, setFee] = useState(30); // Default fee
  
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Create Digital Bin</h3>
      <p className="text-gray-600 mb-2">Location: {location?.name || 'Default Location'}</p>
      <p className="text-gray-600 mb-6">Service fee: ₵{fee}</p>
      
      <button
        onClick={() => onBinCreate(fee)}
        disabled={isLoading}
        className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
      >
        Create Digital Bin - ₵{fee}
      </button>
    </div>
  );
};

const PickupRequestStep = ({ onPickupRequest, isLoading }) => (
  <div className="text-center">
    <h3 className="text-lg font-semibold mb-4">Request Pickup</h3>
    <p className="text-gray-600 mb-6">Your bags are ready! Schedule a pickup.</p>
    
    <button
      onClick={onPickupRequest}
      disabled={isLoading}
      className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
    >
      Request Pickup Now
    </button>
  </div>
);

const SuccessStep = ({ onComplete }) => (
  <div className="text-center">
    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
      <span className="text-3xl">✅</span>
    </div>
    <h3 className="text-xl font-semibold mb-2">Welcome to TrashDrop!</h3>
    <p className="text-gray-600 mb-6">You're all set up and ready to go.</p>
    
    <button
      onClick={onComplete}
      className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
    >
      Go to Dashboard
    </button>
  </div>
);

export default OnboardingFlow;
