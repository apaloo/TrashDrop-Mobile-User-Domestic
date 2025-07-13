import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabaseClient';
import { FaQrcode, FaPlus, FaSpinner, FaSync } from 'react-icons/fa';
import { storeQRCode, getQRCode } from '../utils/qrStorage';
import { subscribeToPickupUpdates, handlePickupUpdate } from '../utils/realtime';
import LocationStep from '../components/schedulePickup/LocationStep';
import ScheduleDetailsStep from '../components/schedulePickup/ScheduleDetailsStep';
import WasteDetailsStep from '../components/schedulePickup/WasteDetailsStep';
import AdditionalInfoStep from '../components/schedulePickup/AdditionalInfoStep';
import ReviewStep from '../components/schedulePickup/ReviewStep';
import ScheduledQRTab from '../components/schedulePickup/ScheduledQRTab';

/**
 * Tab component for the schedule pickup page
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
 * Multi-step form for scheduling recurring pickup
 */
const SchedulePickup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Tab state
  const [activeTab, setActiveTab] = useState('new');
  
  // Current step of the form
  const [currentStep, setCurrentStep] = useState(1);
  
  // Scheduled pickups state
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
  const handleRefresh = () => {
    fetchData(true); // Pass true to show refreshing state
  };
  
  // Fetch data function that can be called manually
  const fetchData = async (showLoading = true) => {
    if (!user) return;
    
    if (showLoading) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    
    setError('');
    
    try {
      // Fetch both pickups and locations in parallel
      const [pickupsResponse, locationsResponse] = await Promise.all([
        fetchScheduledPickups(user.id),
        fetchUserLocations(user.id)
      ]);
      
      setScheduledPickups(pickupsResponse);
      setFormData(prev => ({ ...prev, savedLocations: locationsResponse }));
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };
  
  // Create a ref to store the subscription
  const subscriptionRef = useRef(null);
  
  // Fetch scheduled pickups for the current user
  const fetchScheduledPickups = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('scheduled_pickups')
        .select('*')
        .eq('user_id', userId)
        .order('pickup_date', { ascending: true });
        
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching scheduled pickups:', error);
      throw error;
    }
  };
  
  // Fetch user's saved locations
  const fetchUserLocations = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('user_locations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching user locations:', error);
      throw error;
    }
  };
  
  // Setup real-time subscription
  useEffect(() => {
    if (!user) return;
    
    // Initialize real-time subscription
    subscriptionRef.current = subscribeToPickupUpdates(user.id, (payload) => {
      console.log('Received real-time update:', payload);
      setScheduledPickups(prevPickups => {
        const updatedPickups = handlePickupUpdate(payload, prevPickups);
        // Only update if something actually changed
        if (updatedPickups !== prevPickups) {
          setLastUpdated(new Date().toISOString());
          return updatedPickups;
        }
        return prevPickups;
      });
    });
    
    // Cleanup on unmount
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, [user]);
  
  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [user]);
  
  // Fetch scheduled pickups and locations with error handling and retry logic
  const fetchPickupsAndLocations = async (retryCount = 0) => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      
      // 1. Fetch user's saved locations with retry logic
      const fetchLocations = async (attempt = 0) => {
        try {
          const { data, error } = await supabase
            .from('locations')
            .select('*')
            .eq('user_id', user.id)
            .order('is_default', { ascending: false });
            
          if (error) throw error;
          return data || [];
        } catch (error) {
          if (attempt < 2) { // Retry up to 2 times
            console.warn(`Location fetch attempt ${attempt + 1} failed, retrying...`, error);
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            return fetchLocations(attempt + 1);
          }
          throw error;
        }
      };
      
      // 2. Fetch scheduled pickups with location details
      const fetchPickups = async (attempt = 0) => {
        try {
          const { data, error } = await supabase
            .from('scheduled_pickups')
            .select(`
              *,
              locations:location_id (id, location_name, address, latitude, longitude, is_default)
            `)
            .eq('user_id', user.id)
            .order('pickup_date', { ascending: true });
            
          if (error) throw error;
          return data || [];
        } catch (error) {
          if (attempt < 2) { // Retry up to 2 times
            console.warn(`Pickups fetch attempt ${attempt + 1} failed, retrying...`, error);
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            return fetchPickups(attempt + 1);
          }
          throw error;
        }
      };
      
      // Execute both fetches in parallel
      const [locations, pickups] = await Promise.all([
        fetchLocations(),
        fetchPickups()
      ]);
      
      // 3. Process and update state
      const defaultLocation = locations.find(loc => loc.is_default) || (locations[0] || null);
      
      // Transform pickups for the UI
      const formattedPickups = pickups.map(pickup => {
        const location = pickup.locations || {};
        return {
          ...pickup,
          location_name: location.location_name || 'Location',
          address: location.address || '',
          latitude: location.latitude,
          longitude: location.longitude,
          // For backward compatibility
          scheduledDate: pickup.pickup_date,
          wasteType: pickup.waste_type,
          bagCount: pickup.bag_count,
          preferredTime: pickup.preferred_time,
          specialInstructions: pickup.special_instructions,
          // Ensure we have a QR code URL
          qr_code_url: pickup.qr_code_url || 
            `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=trashdrop-${pickup.id}`
        };
      });
      
      // 4. Update state
      setScheduledPickups(formattedPickups);
      
      // Only update form data if we don't have a location selected yet
      setFormData(prev => {
        // If we already have a location selected, keep it
        if (prev.location_id && !prev.isNewLocation) return prev;
        
        // Otherwise, set the default location
        return {
          ...prev,
          location_id: defaultLocation?.id || null,
          location_name: defaultLocation?.location_name || '',
          address: defaultLocation?.address || '',
          latitude: defaultLocation?.latitude || null,
          longitude: defaultLocation?.longitude || null,
          is_default: Boolean(defaultLocation?.is_default),
          savedLocations: locations,
          isNewLocation: !defaultLocation
        };
      });
      
    } catch (error) {
      console.error('Error in fetchPickupsAndLocations:', error);
      
      // Only show error on last retry attempt
      if (retryCount >= 2) {
        alert('Failed to load pickup data. Please check your connection and refresh the page.');
      } else {
        // Auto-retry after delay
        setTimeout(() => fetchPickupsAndLocations(retryCount + 1), 2000 * (retryCount + 1));
        return;
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  // Check if device is online
  const isOnline = () => {
    return navigator.onLine;
  };

  // Handler for form submission
  const handleSubmit = async () => {
    if (!user) {
      alert('Please sign in to schedule a pickup');
      return;
    }

    setIsLoading(true);
    
    try {
      // 1. Prepare location data
      let locationId = formData.location_id || `local_${Date.now()}`;
      let locationName = formData.location_name || 'My Location';
      
      // 2. Generate a unique ID for the pickup
      const pickupId = `pickup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 3. Create QR code data with payload
      const qrPayload = JSON.stringify({
        pickupId,
        userId: user.id,
        timestamp: Date.now(),
        locationId,
        offline: !isOnline()
      });
      
      // 4. Generate QR code URL
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPayload)}`;
      
      // 5. Prepare pickup data
      const pickupData = {
        id: pickupId,
        user_id: user.id,
        location_id: locationId,
        location_name: locationName,
        schedule_type: formData.frequency === 'one_time' ? 'one_time' : 'recurring',
        waste_type: formData.waste_type || 'general',
        bag_count: formData.bag_count || 1,
        pickup_date: formData.startDate || new Date().toISOString(),
        preferred_time: formData.preferredTime || 'anytime',
        special_instructions: formData.special_instructions || '',
        status: 'scheduled',
        frequency: formData.frequency || 'one_time',
        qr_code_url: qrCodeUrl,
        is_offline: !isOnline(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // Include address data for display
        address: formData.address,
        latitude: formData.latitude,
        longitude: formData.longitude
      };

      // 6. Try to save to database if online
      if (isOnline()) {
        try {
          // Save location if new
          if (formData.isNewLocation) {
            const { data: locationData, error: locationError } = await supabase
              .from('locations')
              .insert([{
                user_id: user.id,
                location_name: locationName,
                address: formData.address,
                latitude: formData.latitude,
                longitude: formData.longitude,
                is_default: formData.savedLocations.length === 0,
                location_type: 'home',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }])
              .select('*')
              .single();
              
            if (!locationError && locationData) {
              locationId = locationData.id;
              locationName = locationData.location_name;
              pickupData.location_id = locationId;
              pickupData.location_name = locationName;
            }
          }
          
          // Save pickup to database
          const { error: pickupError } = await supabase
            .from('scheduled_pickups')
            .insert([pickupData]);
            
          if (pickupError) {
            console.warn('Failed to save to database, continuing offline', pickupError);
            pickupData.is_offline = true;
          }
        } catch (error) {
          console.warn('Error saving to database, continuing offline', error);
          pickupData.is_offline = true;
        }
      } else {
        // Mark as offline if we're not online
        pickupData.is_offline = true;
      }
      
      // 7. Prepare the new pickup object for local state
      const newPickup = {
        ...pickupData,
        id: pickupId,
        location_name: locationName,
        address: formData.address,
        qr_code_url: qrCodeUrl,
        // Add location details for display
        locations: {
          location_name: locationName,
          address: formData.address,
          latitude: formData.latitude,
          longitude: formData.longitude
        },
        // Add timestamps for sorting
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // 8. Add to local state (this will make it appear in the Scheduled QR Code tab)
      setScheduledPickups(prev => [newPickup, ...prev]);
      
      // 9. Save to local storage for offline persistence
      try {
        const offlinePickups = JSON.parse(localStorage.getItem('offlinePickups') || '[]');
        offlinePickups.push(newPickup);
        localStorage.setItem('offlinePickups', JSON.stringify(offlinePickups));
      } catch (e) {
        console.warn('Failed to save to local storage', e);
      }
      
      // 10. Reset form
      setFormData(prev => ({
        ...prev,
        bag_count: 1,
        waste_type: 'general',
        special_instructions: '',
        frequency: 'weekly',
        location_id: null,
        location_name: '',
        address: '',
        latitude: null,
        longitude: null,
        isNewLocation: false
      }));
      
      // 11. Switch to the Scheduled QR Code tab
      setCurrentStep(1);
      setActiveTab('scheduled');
      
      // 12. Show success message with offline indicator if needed
      if (pickupData.is_offline) {
        alert('Pickup scheduled offline! It will be synced when you\'re back online.');
      } else {
        alert('Pickup scheduled successfully!');
      }
      
    } catch (error) {
      console.error('Error scheduling pickup:', error);
      
      // More specific error messages
      if (error.message.includes('network')) {
        alert('Network error. Please check your connection and try again.');
      } else if (error.message.includes('location')) {
        alert('Please select a valid location on the map.');
      } else {
        alert(`Failed to schedule pickup: ${error.message || 'Please try again.'}`);
      }
      
      // Don't proceed to next step on error
      return;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Main render
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="text-2xl font-bold mb-6">Schedule Pickup</h1>
      
      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="flex">
          <TabButton 
            active={activeTab === 'new'}
            onClick={() => setActiveTab('new')}
            icon={FaPlus}
          >
            New Schedule
          </TabButton>
          <TabButton 
            active={activeTab === 'scheduled'}
            onClick={() => setActiveTab('scheduled')}
            icon={FaQrcode}
          >
            Scheduled QR Code
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
                  <span>Loading scheduled pickups...</span>
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
  );
};

export default SchedulePickup;
