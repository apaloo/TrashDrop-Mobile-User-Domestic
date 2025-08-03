import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import supabase from '../utils/supabaseClient.js';
import { FaQrcode, FaPlus, FaSpinner, FaSync } from 'react-icons/fa';
import toastService from '../services/toastService.js';
import { storeQRCode, getQRCode } from '../utils/qrStorage.js';
import { subscribeToBinUpdates, handleBinUpdate } from '../utils/binRealtime.js';
import { syncBinsWithServer, setupNetworkSyncListener } from '../utils/binSyncService.js';
import LocationStep from '../components/digitalBin/LocationStep.js';
import ScheduleDetailsStep from '../components/digitalBin/ScheduleDetailsStep.js';
import WasteDetailsStep from '../components/digitalBin/WasteDetailsStep.js';
import AdditionalInfoStep from '../components/digitalBin/AdditionalInfoStep.js';
import ReviewStep from '../components/digitalBin/ReviewStep.js';
import ScheduledQRTab from '../components/digitalBin/ScheduledQRTab.js';

/**
 * Tab component for the digital bin page
 */
const TabButton = ({ active, onClick, children, icon: Icon }) => (
  <button
    className={`flex-1 py-4 px-2 text-center font-medium text-sm sm:text-base transition-colors duration-200 ${
      active 
        ? 'text-primary border-b-2 border-primary' 
        : 'text-gray-500 hover:text-gray-700'
    }`}
    onClick={onClick}
  >
    <div className="flex items-center justify-center space-x-2">
      {Icon && <Icon className="text-lg" />}
      <span>{children}</span>
    </div>
  </button>
);

/**
 * Multi-step form for getting a digital bin
 */
function DigitalBin() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  
  // Tab state
  const [activeTab, setActiveTab] = useState('new');
  
  // Current step of the form
  const [currentStep, setCurrentStep] = useState(1);
  const [refreshTrigger, setRefreshTrigger] = useState(false);
  
  // Digital bins state
  const [scheduledPickups, setScheduledPickups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState('');
  
  // Form data state
  const [formData, setFormData] = useState({
    // Location details
    location_id: null,
    location_name: 'Home',
    address: '',
    latitude: null,
    longitude: null,
    is_default: true,
    
    // Schedule details
    frequency: 'weekly',
    startDate: '',
    preferredTime: 'morning',
    
    // Waste details
    bag_count: 1,
    waste_type: 'general',
    
    // Additional info
    special_instructions: '',
    
    // Internal state
    savedLocations: [],
    isNewLocation: true
  });
  
  // Progress indicator helper
  const getStepTitle = (step) => {
    switch (step) {
      case 1: return 'Bin Location';
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
    setFormData(prev => {
      const updated = {
        ...prev,
        ...newData
      };
      
      // If switching to a saved location, update the address and coordinates
      if (newData.location_id && !newData.isNewLocation) {
        const selectedLocation = prev.savedLocations.find(
          loc => loc.id === newData.location_id
        );
        
        if (selectedLocation) {
          updated.address = selectedLocation.address;
          updated.latitude = selectedLocation.latitude;
          updated.longitude = selectedLocation.longitude;
          updated.location_name = selectedLocation.location_name;
          updated.is_default = selectedLocation.is_default;
        }
      }
      
      return updated;
    });
  };
  
  // Function to manually refresh data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchData(false);
    } catch (error) {
      console.error('Error refreshing data:', error);
      setError('Failed to refresh data');
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // Fetch data function 
  const fetchData = async (showLoading = true) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError('');
    
    try {
      // Fetch both scheduled pickups and locations
      const [pickups, locations] = await Promise.all([
        fetchScheduledPickups(user.id),
        fetchUserLocations(user.id)
      ]);
      
      // Update state with fetched data
      setScheduledPickups(pickups);
      setFormData(prev => ({ ...prev, savedLocations: locations }));
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load data');
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  };
  
  // Fetch scheduled pickups with location details for the current user
  const fetchScheduledPickups = async (userId) => {
    try {
      // Special handling for test user in development mode
      const isTestUser = process.env.NODE_ENV === 'development' && user?.email === 'prince02@mailinator.com';

      if (isTestUser) {
      console.log('[Dev] Using mock digital bins for test user');
      const mockPickups = [
        {
          id: '123e4567-e89b-12d3-a456-426614174002',
          user_id: userId,
          location_id: '123e4567-e89b-12d3-a456-426614174001',
          qr_code_url: 'https://trashdrop.app/bin/123e4567-e89b-12d3-a456-426614174001',
          frequency: 'weekly',
          waste_type: 'general',
          bag_count: 2,
          special_instructions: 'Test bin',
          is_active: true,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          location_name: 'Test Location',
          address: '123 Test Street, Accra',
          status: 'active' // Add status for proper tab categorization
        }
      ];
      
      // Also store a test QR code in localStorage for this location
      try {
        await storeQRCode('123e4567-e89b-12d3-a456-426614174001', null, {
          binId: '123e4567-e89b-12d3-a456-426614174002',
          syncToSupabase: false
        });
        console.log('[Dev] Stored test QR code for mock bin');
      } catch (error) {
        console.log('[Dev] Error storing test QR code:', error);
      }
      
      setScheduledPickups(mockPickups);
      setLastUpdated(new Date());
      return;
    }

      const { data: pickups, error } = await supabase
        .from('digital_bins')
        .select(`
          id,
          location_id,
          qr_code_url,
          frequency,
          waste_type,
          bag_count,
          special_instructions,
          is_active,
          expires_at,
          created_at,
          updated_at,
          locations:location_id (id, location_name, address)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Error fetching digital bins: ${error.message}`);
      }

      // Flatten location details and integrate QR codes from localStorage
      const flattened = await Promise.all(pickups.map(async pickup => {
        // Get QR code from localStorage if available
        let qrCodeUrl = pickup.qr_code_url;
        try {
          const localQRData = await getQRCode(pickup.location_id);
          if (localQRData && localQRData.qrCodeUrl) {
            qrCodeUrl = localQRData.qrCodeUrl;
            console.log('Integrated local QR code for location:', pickup.location_id);
          }
        } catch (error) {
          console.log('No local QR code found for location:', pickup.location_id);
        }
        
        return {
          ...pickup,
          location_name: pickup.locations?.location_name,
          address: pickup.locations?.address,
          qr_code_url: qrCodeUrl,
          // Map is_active to status for ScheduledQRTab compatibility
          status: pickup.is_active ? 'active' : 'cancelled'
        };
      }));

      setScheduledPickups(flattened);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error in fetchScheduledPickups:', error);
      toastService.error('Failed to fetch digital bins');
      setError(error.message);
    } 
  };
  
  // Fetch user's saved locations
  const fetchUserLocations = async (userId) => {
    try {
      const { data: locations, error } = await supabase
        .from('locations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching user locations:', error);
        throw error;
      }

      return locations || [];
    } catch (error) {
      console.error('Error fetching user locations:', error);
      return [];
    }
  };
  
  // Set up real-time subscription
  useEffect(() => {
    if (!user?.id) return () => {};

    const subscription = subscribeToBinUpdates(user.id, (payload) => {
      handleBinUpdate(payload, scheduledPickups, setScheduledPickups);
    });

    return () => {
      if (subscription?.unsubscribe) {
        subscription.unsubscribe();
      }
    };
  }, [user?.id, scheduledPickups]);
  
  // Listen for bin sync events (fired when offline changes are synced)
  const handlePickupsSynced = (event) => {
    if (event.detail && event.detail.success) {
      fetchData(false);
    }
  };

  // Set up bin sync event listener
  useEffect(() => {
    const handler = (event) => handlePickupsSynced(event);
    window.addEventListener('binsSync', handler);
    return () => {
      window.removeEventListener('binsSync', handler);
    };
  }, []);
  
  // Attempt to sync pickups with server on mount
  const syncOnMount = async () => {
    try {
      await syncBinsWithServer(user.id);
    } catch (error) {
      console.error('Error syncing pickups:', error);
    }
  };
  
  // Set up network sync listener
  useEffect(() => {
    if (!user?.id) return () => {};

    const cleanup = setupNetworkSyncListener(user.id);
    return () => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, [user?.id]);
  
  // Initial data load
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    
    loadData();
  }, [user]);
  
  // Load data with offline support
  const loadData = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      // First try to load from cache if we have a location_id
      if (formData.location_id) {
        const cachedQRCode = await getQRCode(formData.location_id);
        if (cachedQRCode) {
          setScheduledPickups(prev => [
            ...prev,
            { ...cachedQRCode, location_id: formData.location_id }
          ]);
        }
      }
      
      // Then fetch fresh data
      await fetchData(false);
      
      // Attempt to sync any offline changes
      await syncOnMount();
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load data');
      
      // If we have cached data, don't show error
      if (scheduledPickups.length > 0) {
        setError('');
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle visibility changes
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && user?.id) {
      fetchData(false);
    }
  };

  // Set up visibility change listener
  useEffect(() => {
    // Load initial data
    loadData();
    
    // Set up visibility change handler
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Handle data refresh when triggered
  useEffect(() => {
    if (refreshTrigger) {
      fetchData(false).catch(error => {
        console.error('Error refreshing data:', error);
      });
    }
  }, [refreshTrigger, user?.id]);

  // Monitor route changes
  useEffect(() => {
    const checkRoute = () => {
      const currentPath = window.location.pathname;
      if (currentPath !== '/digital-bin') {
        navigate('/digital-bin');
      }
    };

    // Set up route change handler
    const handler = () => checkRoute();
    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('popstate', handler);
    };
  }, []);

  // Handler for online events
  const handleOnline = () => {
    console.log('[Network] Online - fetching latest data');
    if (user?.id) {
      fetchData(false).catch(err => {
        console.error('[Network] Error fetching data:', err);
      });
    }
  };

  const handleOffline = () => {
    console.log('[Network] Offline - using cached data');
    if (user?.id) {
      loadData();
    }
  };

  // Set up online/offline listeners
  useEffect(() => {
    const onlineHandler = () => handleOnline();
    const offlineHandler = () => handleOffline();
    
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    
    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  }, []);  // Empty dependency array since handlers are stable

  // Check if device is online
  const isOnline = () => {
    return typeof navigator !== 'undefined' && 
           typeof navigator.onLine === 'boolean' ? 
           navigator.onLine : true;
  };

  // Handler for form submission
  const handleSubmit = async () => {
    // Use session from component state
    if (!session || !user) {
      console.error('No active session found');
      toastService.error('Please log in to continue');
      navigate('/login', { state: { returnTo: '/digital-bin' } });
      return;
    }

    // Special handling for test user in development mode
    const isTestUser = process.env.NODE_ENV === 'development' && user.email === 'prince02@mailinator.com';
    
    // Verify token hasn't expired (skip check for test user)
    if (!isTestUser) {
      const tokenExpiry = session.expires_at * 1000; // Convert to milliseconds
      if (Date.now() >= tokenExpiry) {
        console.error('Session token expired');
        toastService.error('Your session has expired. Please log in again.');
        navigate('/login', { state: { returnTo: '/digital-bin' } });
        return;
      }
    } else {
      console.log('[Dev] Skipping token expiry check for test user');
    }

    setIsLoading(true);
    try {
      let locationId;

      // If we have a location_id, verify it exists first
      if (formData.location_id) {
        const { data: existingLocation, error: lookupError } = await supabase
          .from('locations')
          .select('id')
          .eq('id', formData.location_id)
          .single();

        if (lookupError || !existingLocation) {
          console.log('Location not found, will create new one');
          formData.location_id = null; // Clear invalid location_id
        } else {
          locationId = existingLocation.id;
        }
      }

      // If no valid location_id, create a new location
      if (!locationId) {
        if (isTestUser) {
          console.log('[Dev] Using mock location for test user');
          locationId = '123e4567-e89b-12d3-a456-426614174001'; // Mock location ID for test user
        } else {
          // Create new location
          const { data: newLocation, error: insertError } = await supabase
            .from('locations')
            .insert({
              user_id: user.id,
              location_name: formData.location_name || 'Home',
              address: formData.address || '',
              is_default: formData.is_default || false
            })
            .select()
            .single();

          if (insertError || !newLocation) {
            throw new Error(`Error creating location: ${insertError?.message || 'No location created'}`);
          }

          locationId = newLocation.id;
        }
      } else {
        // Update existing location
        const { error: updateError } = await supabase
          .from('locations')
          .update({
            location_name: formData.location_name || 'Home',
            address: formData.address || '',
            is_default: formData.is_default || false
          })
          .eq('id', locationId);

        if (updateError) {
          throw new Error(`Error updating location: ${updateError.message}`);
        }
      }

      // Generate QR code URL
      const qrCodeUrl = `https://trashdrop.app/bin/${locationId}`;

      // Calculate expiry date based on frequency
      const expiryDate = new Date();
      switch (formData.frequency) {
        case 'weekly':
          expiryDate.setDate(expiryDate.getDate() + 7);
          break;
        case 'biweekly':
          expiryDate.setDate(expiryDate.getDate() + 14);
          break;
        case 'monthly':
          expiryDate.setMonth(expiryDate.getMonth() + 1);
          break;
        default:
          expiryDate.setDate(expiryDate.getDate() + 7); // Default to weekly
      }

      let binData;
      if (isTestUser) {
        console.log('[Dev] Using mock digital bin for test user');
        binData = {
          id: '123e4567-e89b-12d3-a456-426614174002', // Mock bin ID
          user_id: user.id,
          location_id: locationId,
          qr_code_url: qrCodeUrl,
          frequency: formData.frequency,
          waste_type: formData.waste_type,
          bag_count: formData.bag_count,
          special_instructions: formData.special_instructions,
          is_active: true,
          expires_at: expiryDate.toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      } else {
        const { data, error: binError } = await supabase
          .from('digital_bins')
          .insert({
            user_id: user.id,
            location_id: locationId,
            qr_code_url: qrCodeUrl,
            frequency: formData.frequency,
            waste_type: formData.waste_type,
            bag_count: formData.bag_count,
            special_instructions: formData.special_instructions,
            expires_at: expiryDate.toISOString(),
            is_active: true
          })
          .select()
          .single();

        if (binError || !data) {
          throw new Error(`Error creating digital bin: ${binError?.message || 'No bin created'}`);
        }
        binData = data;
      }

      // Store QR code in local storage first (local-first approach)
      // The QR code will be generated by the app and stored locally
      await storeQRCode(locationId, qrCodeUrl, { 
        binId: binData?.id || `bin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        syncToSupabase: false // Don't sync to Supabase separately - it's already part of the bin data
      });

      // Reset form and update UI
      resetForm();
      setCurrentStep(1);
      setActiveTab('scheduled');

      // Refresh the list of scheduled pickups
      await fetchData(false);

      // Show success message
      toastService.success('Digital bin created successfully!');
    } catch (error) {
      console.error('Error in form submission:', error);
      setError(error.message);
      toastService.error(error.message || 'Failed to create digital bin');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const createDigitalBin = async (locationData) => {
    try {
      // If locationData is just an ID, use it directly
      let locationId = typeof locationData === 'string' ? locationData : null;
      let location = null;

      // If locationData is an object with full location details, create/update location first
      if (!locationId && typeof locationData === 'object') {
        const { data: locationResult, error: locationError } = await supabase
          .from('locations')
          .upsert({
            user_id: user.id,
            location_name: locationData.location_name,
            address: locationData.address,
            is_default: locationData.is_default
          })
          .select()
          .single();

        if (locationError) throw locationError;
        location = locationResult;
        locationId = location.id;
      }

      // Create digital bin with QR code
      const qrCodeUrl = `https://trashdrop.app/bin/${locationId}`;
      const { data: bin, error: binError } = await supabase
        .from('digital_bins')
        .insert({
          user_id: user.id,
          location_id: locationId,
          qr_code_url: qrCodeUrl,
          frequency: formData.frequency,
          waste_type: formData.waste_type,
          bag_count: formData.bag_count,
          special_instructions: formData.special_instructions,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
          is_active: true
        })
        .select()
        .single();

      if (binError) {
        throw new Error(`Error creating digital bin: ${binError.message}`);
      }

      return { location, bin };
    } catch (error) {
      console.error('Error creating digital bin:', error);
      throw error;
    }
  };

  // Reset form helper
  const resetForm = () => {
    try {
      setFormData({
        location_id: null,
        location_name: 'Home',
        address: '',
        latitude: null,
        longitude: null,
        is_default: true,
        frequency: 'weekly',
        startDate: '',
        preferredTime: 'morning',
        bag_count: 1,
        waste_type: 'general',
        special_instructions: '',
        savedLocations: formData.savedLocations,
        isNewLocation: true
      });

      setCurrentStep(1);
      setActiveTab('scheduled');

      // Refresh the list of scheduled pickups
      fetchData(false);
    } catch (error) {
      console.error('Error in form reset:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          {/* Tab navigation */}
          <div className="flex border-b border-gray-200">
            <TabButton 
              active={activeTab === 'new'}
              onClick={() => setActiveTab('new')}
              icon={FaPlus}
            >
              Get Digital Bin
            </TabButton>
            <TabButton 
              active={activeTab === 'scheduled'}
              onClick={() => setActiveTab('scheduled')}
              icon={FaQrcode}
            >
              Bin QR Code
            </TabButton>
          </div>
          
          {/* Tab content */}
          <div className="p-4 sm:p-6">
            {activeTab === 'new' ? (
              <div>
                {/* Step indicators */}
                <div className="mb-6 flex items-center justify-between overflow-x-auto pb-2">
                  {[1, 2, 3, 4, 5].map(step => (
                    <div 
                      key={step}
                      className={`flex flex-col items-center flex-shrink-0 ${currentStep === step ? 'opacity-100' : 'opacity-60'}`}
                      style={{ minWidth: '60px' }}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1
                        ${currentStep >= step ? 'bg-primary text-white' : 'bg-gray-200 text-gray-600'}`}>
                        {step}
                      </div>
                      <span className="text-xs text-center hidden sm:block">{getStepTitle(step)}</span>
                    </div>
                  ))}
                </div>
                
                {/* Form steps */}
                <div className="bg-white">
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
                  <div className="text-center mt-6">
                    <a href="/pickup-request" className="text-primary hover:underline text-sm">
                      Need a one-time pickup? Request here
                    </a>
                  </div>
                )}
              </div>
          ) : (
            <div>
              {isLoading ? (
                <div className="flex justify-center items-center py-12">
                  <FaSpinner className="animate-spin text-2xl text-primary mr-3" />
                  <span>Loading digital bins...</span>
                </div>
              ) : (
                <ScheduledQRTab 
                  scheduledPickups={scheduledPickups} 
                  onRefresh={fetchData}
                  isLoading={isLoading}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
);
}

export default DigitalBin;
