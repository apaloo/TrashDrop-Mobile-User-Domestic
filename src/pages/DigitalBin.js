import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import supabase from '../utils/supabaseClient.js';
import { FaQrcode, FaPlus, FaSpinner, FaSync, FaTimes } from 'react-icons/fa';
import toastService from '../services/toastService.js';
// QR storage removed - using server-first approach
// Real-time and sync utilities removed - server-first approach only
import GeolocationService from '../utils/geolocationService.js';
// Cache utilities removed - no caching approach
import LocationStep from '../components/digitalBin/LocationStep.js';
import ScheduleDetailsStep from '../components/digitalBin/ScheduleDetailsStep.js';
import WasteDetailsStep from '../components/digitalBin/WasteDetailsStep.js';
import AdditionalInfoStep from '../components/digitalBin/AdditionalInfoStep.js';
import ReviewStep from '../components/digitalBin/ReviewStep.js';
import ScheduledQRTab from '../components/digitalBin/ScheduledQRTab.js';
import { getCostBreakdown } from '../utils/costCalculator.js';
import { prepareDigitalBinData } from '../services/digitalBinService.js';

/**
 * Tab component for the digital bin page
 */
const TabButton = ({ active, onClick, children, icon: Icon }) => (
  <button
    className={`flex-1 py-4 px-2 text-center font-medium text-sm sm:text-base transition-colors duration-200 ${
      active 
        ? 'text-primary border-b-2 border-primary' 
        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
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
  const { user, session, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  // Tab state
  const [activeTab, setActiveTab] = useState('new');
  
  // Current step of the form
  const [currentStep, setCurrentStep] = useState(1);
  const [refreshTrigger, setRefreshTrigger] = useState(false);
  
  // NO CACHE: Cache management function removed
  
  // Debug function removed
  
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
    frequency: 'one-time',
    startDate: '',
    preferredTime: 'morning',
    
    // Waste details
    bag_count: 1,
    waste_type: 'general',
    bin_size_liters: 120,        // NEW: Default to 120L (standard size)
    is_urgent: false,             // NEW: Default not urgent
    
    // Additional info
    notes: '',
    photos: [],
    
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
    // Check if user is available before proceeding
    if (!user?.id) {
      console.log('[DigitalBin] User not available, skipping data fetch');
      if (showLoading) {
        setIsLoading(false);
      }
      return;
    }

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
  
  // Fetch scheduled pickups with location details for the current user - SERVER-FIRST APPROACH
  const fetchScheduledPickups = async (userId) => {
    try {
      console.log('[DigitalBin] Fetching digital bins from server for user:', userId);

      // SERVER-FIRST: Always fetch from server first
      try {
        const { data: pickups, error } = await supabase
          .from('digital_bins')
          .select(`
            id,
            location_id,
            qr_code_url,
            frequency,
            waste_type,
            bag_count,
            is_active,
            expires_at,
            created_at,
            updated_at,
            bin_locations:location_id (id, location_name, address)
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) {
          console.warn(`[DigitalBin] Server fetch error: ${error.message}`);
          throw new Error(`Error fetching digital bins: ${error.message}`);
        }

        console.log(`[DigitalBin] Server returned ${pickups.length} digital bins:`, pickups);
        
        // Transform server data to consistent format
        const transformedBins = pickups.map(pickup => {
          const transformed = {
            ...pickup,
            location_name: pickup.bin_locations?.location_name,
            address: pickup.bin_locations?.address,
            status: pickup.is_active ? 'active' : 'cancelled'
          };
          console.log(`[DigitalBin] Transformed bin:`, transformed);
          return transformed;
        });

        // NO CACHING: Pure server-first approach
        console.log(`[DigitalBin] Server returned ${transformedBins.length} digital bins`);
        console.log(`[DigitalBin] Active bins: ${transformedBins.filter(b => b.status === 'active').length}`);
        
        setScheduledPickups(transformedBins);
        setLastUpdated(new Date());
        return transformedBins;
        
      } catch (supabaseError) {
        console.error('[DigitalBin] Server error:', supabaseError);
        throw supabaseError;
      }
    } catch (error) {
      console.error('[DigitalBin] Error in fetchScheduledPickups:', error);
      toastService.error('Failed to fetch digital bins');
      setError(error.message);
      return [];
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
  
  // NO REAL-TIME: Removed subscription setup
  
  // NO SYNC: Removed all sync event handlers
  
  // NO SYNC: Removed sync function
  
  // NO SYNC: Removed network sync listener
  
  // Initial data load
  useEffect(() => {
    // Don't redirect if auth is still loading
    if (authLoading) {
      console.log('[DigitalBin] Auth is loading, waiting...');
      return;
    }
    
    // In development, be more lenient about user checks
    if (process.env.NODE_ENV === 'development') {
      const hasStoredUser = localStorage.getItem('trashdrop_user');
      if (hasStoredUser && !user) {
        console.log('[DigitalBin] Development mode - has stored user, waiting for auth to catch up');
        return; // Don't redirect, let auth context catch up
      }
    }
    
    // Only redirect if auth is done loading and definitely no user
    if (!user && !authLoading) {
      console.log('[DigitalBin] No user found after auth loading, redirecting to login');
      navigate('/login');
      return;
    }
    
    // Only load data if we have a user
    if (user) {
      loadData();
    }
  }, [user, authLoading, navigate]);
  
  // NO CACHING: Removed migration function

  // Load data - SERVER-FIRST approach
  const loadData = async () => {
    // Check if user is available before proceeding
    if (!user?.id) {
      console.log('[DigitalBin] User not available, skipping loadData');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      // NO CACHING: Direct server fetch only
      await fetchData(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load data');
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
    // Load initial data only if user is available
    if (user?.id) {
      loadData();
    }
    
    // Set up visibility change handler
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.id]); // Add user.id as dependency to re-run when user changes

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

    // Verify token hasn't expired
    const tokenExpiry = session.expires_at * 1000; // Convert to milliseconds
    if (Date.now() >= tokenExpiry) {
      console.error('Session token expired');
      toastService.error('Your session has expired. Please log in again.');
      navigate('/login', { state: { returnTo: '/digital-bin' } });
      return;
    }

    setIsLoading(true);
    try {
      let locationId;

      // If we have a location_id, verify it exists in bin_locations table (required for foreign key)
      if (formData.location_id) {
        console.log(`[DigitalBin] Checking if location ${formData.location_id} exists in bin_locations table`);
        
        // First check bin_locations table (required for digital_bins foreign key)
        const { data: binLocation, error: binLookupError } = await supabase
          .from('bin_locations')
          .select('id, location_name, address')
          .eq('id', formData.location_id)
          .single();

        if (!binLookupError && binLocation) {
          console.log('[DigitalBin] Location found in bin_locations table:', binLocation);
          locationId = binLocation.id;
        } else {
          console.log('[DigitalBin] Location not found in bin_locations, checking locations table...');
          
          // Check if it exists in locations table
          const { data: legacyLocation, error: legacyLookupError } = await supabase
            .from('locations')
            .select('id, name, location_name, address, latitude, longitude')
            .eq('id', formData.location_id)
            .single();

          if (!legacyLookupError && legacyLocation) {
            console.log('[DigitalBin] Location found in locations table, migrating to bin_locations:', legacyLocation);
            
            // Migrate location from locations to bin_locations table
            try {
              const migratedLocationData = {
                user_id: user.id,
                location_name: legacyLocation.location_name || legacyLocation.name || 'Migrated Location',
                address: legacyLocation.address || '',
                coordinates: `POINT(${legacyLocation.longitude || 0} ${legacyLocation.latitude || 0})`,
                is_default: false
              };
              
              const { data: newBinLocation, error: migrationError } = await supabase
                .from('bin_locations')
                .insert(migratedLocationData)
                .select()
                .single();
                
              if (!migrationError && newBinLocation) {
                console.log('[DigitalBin] Successfully migrated location to bin_locations:', newBinLocation);
                locationId = newBinLocation.id;
              } else {
                console.error('[DigitalBin] Failed to migrate location:', migrationError);
                formData.location_id = null; // Clear invalid location_id, will create new
              }
            } catch (migrationError) {
              console.error('[DigitalBin] Error during location migration:', migrationError);
              formData.location_id = null; // Clear invalid location_id, will create new
            }
          } else {
            console.log('[DigitalBin] Location not found in either table, will create new one');
            formData.location_id = null; // Clear invalid location_id
          }
        }
      }

      // If no valid location_id, create a new location
      if (!locationId) {
        if (isTestUser) {
          console.log('[Dev] Using mock location for test user');
          locationId = '123e4567-e89b-12d3-a456-426614174001'; // Mock location ID for test user
        } else {
          // Ensure we have coordinates for the location (required by database schema)
          let latitude = formData.latitude;
          let longitude = formData.longitude;
          
          console.log('Initial coordinates from formData:', { latitude, longitude });
          
          // If coordinates are not available, use default location (Accra, Ghana)
          if (latitude === null || longitude === null || latitude === undefined || longitude === undefined) {
            console.log('No coordinates provided, using default location (Accra, Ghana)');
            
            try {
              const defaultCoords = GeolocationService.DEFAULT_LOCATION;
              console.log('GeolocationService default coords:', defaultCoords);
              latitude = defaultCoords.latitude;
              longitude = defaultCoords.longitude;
            } catch (error) {
              console.error('Error accessing GeolocationService.DEFAULT_LOCATION:', error);
              throw new Error('Location coordinates are required. Please enable location services and try again.');
            }
            
            // Final validation - ensure we have valid numbers
            if (typeof latitude !== 'number' || typeof longitude !== 'number' || 
                isNaN(latitude) || isNaN(longitude)) {
              console.error('Invalid coordinates detected'); 
              throw new Error('Invalid location coordinates. Please enable location services and try again.');
            }
          }
          
          console.log('Final coordinates for location creation:', { latitude, longitude, types: { lat: typeof latitude, lng: typeof longitude } });
          
          // Create new location with required coordinates
          // Try both 'locations' and 'bin_locations' tables to handle schema variations
          let newLocation = null;
          let insertError = null;
          
          // Validate coordinates are available
          if (!latitude || !longitude) {
            throw new Error('Location coordinates are required but not available');
          }
          
          // Prepare location data for both bin_locations and locations tables
          const locationData = {
            user_id: user.id,
            location_name: formData.location_name || 'Home',
            address: formData.address || '',
            coordinates: `POINT(${longitude} ${latitude})`, // PostGIS Point format: POINT(lng lat)
            is_default: false
          };
          
          // First try 'bin_locations' table (as indicated by the foreign key error)
          try {
            console.log('Attempting to create location in bin_locations table');
            console.log('[DigitalBin] Creating location with actual schema:', locationData);
            
            // Try with timeout first
            let binLocationResult;
            try {
              const insertPromise = supabase
                .from('bin_locations')
                .insert(locationData)
                .select()
                .single();
              
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Location insert timed out after 10 seconds')), 10000)
              );
              
              binLocationResult = await Promise.race([insertPromise, timeoutPromise]);
            } catch (timeoutError) {
              console.warn('[DigitalBin] Insert with select timed out, trying insert only:', timeoutError.message);
              
              // Fallback: Insert without select (may succeed even if RLS blocks select)
              const insertOnlyResult = await supabase
                .from('bin_locations')
                .insert(locationData);
              
              if (insertOnlyResult.error) {
                throw new Error(`Failed to create location: ${insertOnlyResult.error.message}`);
              }
              
              console.log('[DigitalBin] Insert succeeded without select, querying for location');
              
              // Query for the location we just created
              const queryResult = await supabase
                .from('bin_locations')
                .select('*')
                .eq('user_id', user.id)
                .eq('location_name', locationData.location_name)
                .eq('address', locationData.address)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
              
              if (queryResult.error || !queryResult.data) {
                // If we still can't query it, create a local-only location
                console.warn('[DigitalBin] Could not query created location, using timestamp-based ID');
                throw new Error('Location created but could not be retrieved');
              }
              
              binLocationResult = { data: queryResult.data, error: null };
            }
              
            if (binLocationResult.error) {
              console.error('[DigitalBin] Failed to create location:', binLocationResult.error);
              throw new Error(`Failed to create location: ${binLocationResult.error.message}`);
            }
            
            if (!binLocationResult.data) {
              throw new Error('No location data returned from insert');
            }
            
            newLocation = binLocationResult.data;
            console.log('[DigitalBin] Successfully created location:', newLocation);
          } catch (binLocationError) {
            console.warn('bin_locations table completely failed, trying locations table:', binLocationError?.message || binLocationError);
            
            // Fallback to 'locations' table with different schema
            try {
              console.log('Attempting to create location in locations table');
              
              // Create fallback data for locations table (might use different field names)
              const fallbackLocationData = {
                user_id: user.id,
                name: formData.location_name || 'Home', // locations table might use 'name' instead of 'location_name'
                address: formData.address || '',
                latitude: latitude,
                longitude: longitude,
                is_default: false
              };
              
              const { data: locationTableData, error: locationTableError } = await supabase
                .from('locations')
                .insert(fallbackLocationData)
                .select()
                .single();
                
              if (!locationTableError && locationTableData) {
                newLocation = locationTableData;
                console.log('Successfully created location in locations table');
              } else {
                insertError = locationTableError || new Error('No data returned from locations table');
              }
            } catch (locationError) {
              insertError = locationError;
              console.error('Both bin_locations and locations tables failed:', locationError.message);
            }
          }

          if (insertError || !newLocation) {
            // If all database operations fail, create a local-only location for offline usage
            console.warn('All database location creation failed, creating local-only location');
            const localLocationId = `local_location_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Store location data locally for offline use
            const localLocationData = {
              id: localLocationId,
              user_id: user.id,
              location_name: formData.location_name || 'Home',
              address: formData.address || '',
              latitude: latitude,
              longitude: longitude,
              is_default: formData.is_default || false,
              created_at: new Date().toISOString(),
              local_only: true,
              sync_pending: true
            };
            
            try {
              const localLocationKey = `location_${localLocationId}`;
              localStorage.setItem(localLocationKey, JSON.stringify(localLocationData));
              
              // Add to pending sync list
              const pendingSyncList = JSON.parse(localStorage.getItem('pending_location_sync') || '[]');
              pendingSyncList.push(localLocationId);
              localStorage.setItem('pending_location_sync', JSON.stringify(pendingSyncList));
              
              console.log('Created local-only location:', localLocationId);
              locationId = localLocationId;
            } catch (localStorageError) {
              console.error('Failed to create local location:', localStorageError);
              throw new Error(`Error creating location: ${insertError?.message || 'Failed to create location in any table and localStorage also failed'}`);
            }
          } else {
            locationId = newLocation.id;
          }
        }
      } else {
        // Ensure we have coordinates for the location update
        let latitude = formData.latitude;
        let longitude = formData.longitude;
        
        console.log('Initial coordinates from formData for update:', { latitude, longitude });
        
        // If coordinates are not available, use default location (Accra, Ghana)
        if (latitude === null || longitude === null || latitude === undefined || longitude === undefined) {
          console.log('No coordinates provided for update, using default location (Accra, Ghana)');
          
          try {
            const defaultCoords = GeolocationService.DEFAULT_LOCATION;
            console.log('GeolocationService default coords (update):', defaultCoords);
            latitude = defaultCoords.latitude;
            longitude = defaultCoords.longitude;
          } catch (error) {
            console.error('Error accessing GeolocationService.DEFAULT_LOCATION (update):', error);
            throw new Error('Location coordinates are required for update. Please enable location services and try again.');
          }
          
          // Final validation - ensure we have valid numbers
          if (typeof latitude !== 'number' || typeof longitude !== 'number' || 
              isNaN(latitude) || isNaN(longitude)) {
            console.error('Invalid coordinates detected in update'); 
            throw new Error('Invalid location coordinates for update. Please enable location services and try again.');
          }
        }
        
        console.log('Final coordinates for location update:', { latitude, longitude, types: { lat: typeof latitude, lng: typeof longitude } });
        
        // Update existing location
        const { error: updateError } = await supabase
          .from('locations')
          .update({
            location_name: formData.location_name || 'Home',
            address: formData.address || '',
            latitude: latitude,
            longitude: longitude,
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

      // SERVER-FIRST: Always try to create in database first
      console.log('[DigitalBin] Creating digital bin in database');
      console.log('[DigitalBin] Location ID:', locationId);
      console.log('[DigitalBin] User ID:', user.id);
      
      // Prepare digital bin data with calculated fees
      const digitalBinData = prepareDigitalBinData({
        user_id: user.id,
        location_id: locationId,
        qr_code_url: qrCodeUrl,
        frequency: formData.frequency,
        waste_type: formData.waste_type,
        bag_count: formData.bag_count,
        bin_size_liters: formData.bin_size_liters,
        is_urgent: formData.is_urgent || false,
        expires_at: expiryDate.toISOString()
      });
      
      console.log('[DigitalBin] Digital bin data with fees:', digitalBinData);
      
      const { data: binData, error: binError} = await supabase
        .from('digital_bins')
        .insert(digitalBinData)
        .select()
        .single();

      if (binError) {
        console.error('[DigitalBin] Database insert failed:', binError);
        throw new Error(`Failed to create digital bin: ${binError.message}`);
      }
      
      if (!binData) {
        console.error('[DigitalBin] No data returned from insert');
        throw new Error('No data returned from digital bin creation');
      }
      
      console.log('[DigitalBin] Successfully created digital bin:', binData);

      // SERVER-FIRST: Immediately refresh from server to get all bins
      console.log('[DigitalBin] Digital bin created, refreshing from server');
      await fetchScheduledPickups(user.id);

      // Reset form and update UI
      resetForm();
      setCurrentStep(1);
      setActiveTab('scheduled');

      // Show success message
      toastService.success(`Digital bin created successfully! ${isTestUser ? '(Test mode)' : ''}`);
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
      
      // Prepare digital bin data with calculated fees
      const digitalBinData = prepareDigitalBinData({
        user_id: user.id,
        location_id: locationId,
        qr_code_url: qrCodeUrl,
        frequency: formData.frequency,
        waste_type: formData.waste_type,
        bag_count: formData.bag_count,
        bin_size_liters: formData.bin_size_liters,
        is_urgent: formData.is_urgent || false,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      });
      
      const { data: bin, error: binError } = await supabase
        .from('digital_bins')
        .insert(digitalBinData)
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
        frequency: 'one-time',
        startDate: '',
        preferredTime: 'morning',
        bag_count: 1,
        waste_type: 'general',
        savedLocations: formData.savedLocations,
        isNewLocation: true
      });

      setCurrentStep(1);
      setActiveTab('scheduled');
    } catch (error) {
      console.error('Error in form reset:', error);
      setError(error.message);
    }
  };

  // Show loading spinner while auth is loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden relative flex flex-col">
        {/* Close button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
          aria-label="Close modal"
        >
          <FaTimes className="text-gray-600 dark:text-gray-300 text-xl" />
        </button>
        
        {/* Tab navigation */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-10 shadow-sm flex-shrink-0 pr-16">
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
        
        {/* Tab content - scrollable area */}
        <div className="flex-1 overflow-y-auto">
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
                        ${currentStep >= step ? 'bg-primary text-white' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                        {step}
                      </div>
                      <span className="text-xs text-center hidden sm:block dark:text-gray-300">{getStepTitle(step)}</span>
                    </div>
                  ))}
                </div>
                
                {/* Form steps */}
                <div className="bg-white dark:bg-gray-800">
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
                    <a href="/pickup-request" className="text-primary hover:underline text-sm dark:text-primary-light">
                      Need a one-time pickup? Request here
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Debug controls removed */}
                
                <ScheduledQRTab 
                  scheduledPickups={scheduledPickups} 
                  onRefresh={handleRefresh}
                  isLoading={isLoading}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DigitalBin;
