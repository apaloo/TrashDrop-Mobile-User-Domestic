import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import supabase from '../utils/supabaseClient.js';
import { FaSpinner, FaSync, FaTimes, FaPlus } from 'react-icons/fa';
import toastService from '../services/toastService.js';
import { connectionProblem } from '../utils/connectionProblem.js';
import { useReloadWhenBack } from '../hooks/useReloadWhenBack.js';
import debug from '../utils/debug.js';
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
import PageHeader from '../components/ui/PageHeader.js';
import { card, infoNote, primaryButton } from '../components/ui/styles.js';
import { getBinSizeLabelShort } from '../utils/costCalculator.js';
import { prepareDigitalBinData, transformBin } from '../services/digitalBinService.js';
import { uploadPhotos } from '../services/photoUploadService.js';
import useGpsRefinement from '../hooks/useGpsRefinement.js';
import { checkPromotionalEligibility, getPromotionalFee, getAllPromotionalFees } from '../services/promotionalService.js';
import { answerReminder, createReminderPlan, isRepeatFrequency } from '../services/binReminderService.js';


// Pickup time windows offered in ScheduleDetailsStep
const PREFERRED_TIME_LABELS = {
  morning: 'Morning (8am - 12pm)',
  afternoon: 'Afternoon (12pm - 4pm)',
  evening: 'Evening (4pm - 8pm)'
};

// Waste types offered in WasteDetailsStep
const WASTE_TYPE_LABELS = {
  general: 'General waste',
  recycling: 'Recycling',
  organic: 'Organic waste'
};

/**
 * Multi-step form for getting a digital bin
 */
function DigitalBin() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const routeLocation = useLocation();

  // Set when the form was opened from a collection reminder pop-up: the
  // booking answers that reminder instead of starting a new reminder plan
  const reminderRef = useRef(null);
  
  // View state: 'list' or 'create'
  const [viewMode, setViewMode] = useState('list');
  
  // Current step of the form
  const [currentStep, setCurrentStep] = useState(1);
  const [refreshTrigger, setRefreshTrigger] = useState(false);
  
  // NO CACHE: Cache management function removed
  
  // Debug function removed
  
  // Digital bins state
  const [scheduledPickups, setScheduledPickups] = useState([]);
  // Bins or locations couldn't load: retried in the background
  const [dataIncomplete, setDataIncomplete] = useState(false);
  const dataIncompleteRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState('');
  
  // Track newly created bin ID for auto-expand
  const [newlyCreatedBinId, setNewlyCreatedBinId] = useState(null);

  // Summary of the last successful submission, shown as an inline confirmation
  // on the list view (the toast alone is easy to miss on a slow phone)
  const [submissionSuccess, setSubmissionSuccess] = useState(null);
  
  // Promotional pricing state
  const [promoState, setPromoState] = useState({
    isEligible: false,
    usedCount: 0,
    maxRequests: 0,
    allFees: [],       // All promotional fee rows for banner display
    currentFee: null,  // Fee for currently selected bin size
    isLoading: true
  });
  
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
    numberOfBags: 1,              // UI field name (used in WasteDetailsStep)
    bag_count: 1,                 // Database field name (kept in sync)
    wasteType: 'general',         // UI field name (used in WasteDetailsStep)
    waste_type: 'general',        // Database field name (kept in sync)
    bin_size_liters: 120,        // NEW: Default to 120L (standard size)
    is_urgent: false,             // NEW: Default not urgent
    
    // Additional info
    notes: '',
    photos: [],
    
    // Internal state
    savedLocations: [],
    isNewLocation: true,
    
    // GPS accuracy tracking
    gps_accuracy: null
  });
  
  // Background GPS refinement - runs on pages 1-4, stops on summary page (5)
  // This improves GPS precision while user fills out the form
  const { bestPosition, isRefining, refinementCount } = useGpsRefinement({
    isActive: viewMode === 'create' && currentStep < 5, // Active during form, stops on summary
    initialLatitude: formData.latitude,
    initialLongitude: formData.longitude,
    initialAccuracy: formData.gps_accuracy,
    pollInterval: 5000, // Check every 5 seconds
    onImprovedPosition: (newPosition) => {
      console.log(`[DigitalBin] GPS improved: ${newPosition.accuracy}m`);
      setFormData(prev => ({
        ...prev,
        latitude: newPosition.latitude,
        longitude: newPosition.longitude,
        gps_accuracy: newPosition.accuracy
      }));
    }
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
      debug.log('[DigitalBin] User not available, skipping data fetch');
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
        // One message at most: the background retries stay silent
        fetchScheduledPickups(user.id, { silent: dataIncompleteRef.current }),
        fetchUserLocations(user.id)
      ]);
      dataIncompleteRef.current = pickups === null || locations === null;
      setDataIncomplete(dataIncompleteRef.current);
      
      // Update state with fetched data (null: couldn't load, keep what's there)
      if (pickups) setScheduledPickups(pickups);
      if (locations) setFormData(prev => ({ ...prev, savedLocations: locations }));
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
  const fetchScheduledPickups = async (userId, { silent = false } = {}) => {
    try {
      debug.log('[DigitalBin] Fetching digital bins from server for user:', userId);

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
            status,
            collected_at,
            expires_at,
            created_at,
            updated_at,
            fee,
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
        const transformedBins = pickups.map(transformBin);

        // NO CACHING: Pure server-first approach
        console.log(`[DigitalBin] Server returned ${transformedBins.length} digital bins`);
        console.log(`[DigitalBin] Active bins: ${transformedBins.filter(b => b.status === 'active').length}`);
        console.log(`[DigitalBin] Completed bins: ${transformedBins.filter(b => b.status === 'completed').length}`);
        console.log(`[DigitalBin] Cancelled bins: ${transformedBins.filter(b => b.status === 'cancelled').length}`);
        
        setScheduledPickups(transformedBins);
        setLastUpdated(new Date());
        return transformedBins;
        
      } catch (supabaseError) {
        console.error('[DigitalBin] Server error:', supabaseError);
        throw supabaseError;
      }
    } catch (error) {
      console.error('[DigitalBin] Error in fetchScheduledPickups:', error);
      // No connection: say nothing, the page refreshes itself on reconnect
      if (connectionProblem(error)) return null;
      if (!silent) {
        toastService.error('Failed to fetch digital bins');
        setError(error.message);
      }
      return null;
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
      return null;
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
      debug.log('[DigitalBin] Auth is loading, waiting...');
      return;
    }
    
    // In development, be more lenient about user checks
    if (process.env.NODE_ENV === 'development') {
      const hasStoredUser = localStorage.getItem('trashdrop_user');
      if (hasStoredUser && !user) {
        debug.log('[DigitalBin] Development mode - has stored user, waiting for auth to catch up');
        return; // Don't redirect, let auth context catch up
      }
    }
    
    // Only redirect if auth is done loading and definitely no user
    if (!user && !authLoading) {
      debug.log('[DigitalBin] No user found after auth loading, redirecting to login');
      navigate('/login');
      return;
    }
    
    // Only load data if we have a user
    if (user) {
      loadData();
      // Check promotional eligibility
      checkPromotionalEligibility(user.id).then(async (eligibility) => {
        let allFees = [];
        if (eligibility.isEligible) {
          allFees = await getAllPromotionalFees();
        }
        setPromoState(prev => ({
          ...prev,
          isEligible: eligibility.isEligible,
          usedCount: eligibility.usedCount,
          maxRequests: eligibility.maxRequests,
          allFees,
          isLoading: false
        }));
        console.log('[DigitalBin] Promotional eligibility:', eligibility);
      }).catch(err => {
        console.warn('[DigitalBin] Promotional check failed:', err);
        setPromoState(prev => ({ ...prev, isLoading: false }));
      });
    }
  }, [user, authLoading, navigate]);
  
  // Opened from a collection reminder: fill in the booking from the reminder
  // plan and start at the photo step, since everything else is known
  useEffect(() => {
    const reminder = routeLocation.state?.bookFromReminder;
    if (!reminder || !user) return;
    reminderRef.current = reminder.reminder_id;
    setFormData(prev => ({
      ...prev,
      location_id: reminder.location_id || null,
      location_name: reminder.location_name || 'Home',
      address: reminder.address || '',
      latitude: reminder.latitude ?? null,
      longitude: reminder.longitude ?? null,
      isNewLocation: !reminder.location_id,
      frequency: reminder.frequency,
      startDate: reminder.due_date,
      preferredTime: reminder.preferred_time || 'morning',
      numberOfBags: reminder.bag_count || 1,
      bag_count: reminder.bag_count || 1,
      wasteType: reminder.waste_type || 'general',
      waste_type: reminder.waste_type || 'general',
      bin_size_liters: reminder.bin_size_liters || 120,
      is_urgent: false,
      notes: reminder.notes || '',
      photos: []
    }));
    setViewMode('create');
    setCurrentStep(4);
    // Don't fill the form again on a reload or when coming back to the page
    navigate(routeLocation.pathname, { replace: true, state: null });
  }, [routeLocation.state, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // NO CACHING: Removed migration function

  // Load data - SERVER-FIRST approach
  const loadData = async () => {
    // Check if user is available before proceeding
    if (!user?.id) {
      debug.log('[DigitalBin] User not available, skipping loadData');
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

  // Set up visibility change listener (data loading handled by initial load effect)
  useEffect(() => {
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


  useReloadWhenBack(dataIncomplete, () => fetchData(false).catch(() => {}));

  // Set up online/offline listeners with proper closure handling
  useEffect(() => {
    const handleOnline = () => {
      console.log('[Network] Online - fetching latest data');
      if (user?.id) {
        fetchData(false).catch(err => {
          console.error('[Network] Error fetching data:', err);
        });
      }
    };

    const handleOffline = () => {
      console.log('[Network] Offline - using localStorage cache');
      // Don't call loadData() - it hits Supabase which fails offline
      // Instead, rely on localStorage data already loaded in ScheduledQRTab
      try {
        const cached = localStorage.getItem('digitalBins');
        if (cached) {
          const bins = JSON.parse(cached);
          console.log('[Network] Loaded', bins.length, 'bins from localStorage cache');
          setScheduledPickups(bins);
        }
      } catch (err) {
        console.error('[Network] Error loading cached data:', err);
      }
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user?.id]);  // Re-create handlers when user changes

  // Check if device is online
  const isOnline = () => {
    return typeof navigator !== 'undefined' && 
           typeof navigator.onLine === 'boolean' ? 
           navigator.onLine : true;
  };

  // Handler for form submission
  const handleSubmit = async () => {
    if (!user) {
      console.error('No active session found');
      toastService.error('Please log in to continue');
      navigate('/login', { state: { returnTo: '/digital-bin' } });
      return;
    }

    // Ask Supabase for the current session rather than trusting the one held
    // in state, which can be an hour old after the phone slept: getSession
    // renews it if it has expired. Only a session Supabase no longer has
    // means signing in again; a connection problem is left to the request.
    const { data: current, error: sessionError } = await supabase.auth.getSession();
    if (!current?.session && !sessionError) {
      console.error('Session ended');
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
          debug.log('[DigitalBin] Location found in bin_locations table:', binLocation);
          locationId = binLocation.id;
        } else {
          debug.log('[DigitalBin] Location not found in bin_locations, checking locations table...');
          
          // Check if it exists in locations table
          const { data: legacyLocation, error: legacyLookupError } = await supabase
            .from('locations')
            .select('id, name, location_name, address, latitude, longitude, coordinates')
            .eq('id', formData.location_id)
            .single();

          if (!legacyLookupError && legacyLocation) {
            debug.log('[DigitalBin] Location found in locations table, migrating to bin_locations:', legacyLocation);
            
            // Extract coordinates from PostGIS POINT format if separate lat/lng not available
            let latitude = legacyLocation.latitude;
            let longitude = legacyLocation.longitude;
            
            if ((!latitude || !longitude) && legacyLocation.coordinates) {
              // Parse PostGIS POINT format: "POINT(lng lat)"
              const match = legacyLocation.coordinates.match(/POINT\(([^ ]+) ([^ ]+)\)/);
              if (match) {
                longitude = parseFloat(match[1]);
                latitude = parseFloat(match[2]);
                debug.log('[DigitalBin] Parsed coordinates from PostGIS:', { latitude, longitude });
              }
            }
            
            // Migrate location from locations to bin_locations table
            try {
              const migratedLocationData = {
                user_id: user.id,
                location_name: legacyLocation.location_name || legacyLocation.name || 'Migrated Location',
                address: legacyLocation.address || '',
                coordinates: `POINT(${longitude || 0} ${latitude || 0})`,
                is_default: false
              };
              
              const { data: newBinLocation, error: migrationError } = await supabase
                .from('bin_locations')
                .insert(migratedLocationData)
                .select()
                .single();
                
              if (!migrationError && newBinLocation) {
                debug.log('[DigitalBin] Successfully migrated location to bin_locations:', newBinLocation);
                locationId = newBinLocation.id;
              } else {
                console.error('[DigitalBin] Failed to migrate location:', migrationError);
                locationId = null; // Clear invalid location_id, will create new
              }
            } catch (migrationError) {
              console.error('[DigitalBin] Error during location migration:', migrationError);
              locationId = null; // Clear invalid location_id, will create new
            }
          } else {
            debug.log('[DigitalBin] Location not found in either table, will create new one');
            locationId = null; // Clear invalid location_id
          }
        }
      }

      // If no valid location_id, create a new location
      if (!locationId) {
        // Ensure we have coordinates for the location (required by database schema)
        let latitude = formData.latitude;
        let longitude = formData.longitude;
        
        console.log('Initial coordinates from formData:', { latitude, longitude });
        
        // NO FALLBACK - require actual GPS coordinates
        // Collectors need precise locations (≤5m accuracy), cannot accept default/approximate positions
        if (latitude === null || longitude === null || latitude === undefined || longitude === undefined) {
          console.error('[DigitalBin] No GPS coordinates provided - cannot proceed without precise location');
          throw new Error('GPS location is required. Please enable location services, move to an open area, and try again.');
        }
        
        // Validate coordinates are valid numbers
        if (typeof latitude !== 'number' || typeof longitude !== 'number' || 
            isNaN(latitude) || isNaN(longitude)) {
          console.error('[DigitalBin] Invalid coordinates detected:', { latitude, longitude }); 
          throw new Error('Invalid GPS coordinates. Please get a fresh GPS reading and try again.');
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
          debug.log('[DigitalBin] Creating location with actual schema:', locationData);
          
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
            
            debug.log('[DigitalBin] Insert succeeded without select, querying for location');
            
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
          debug.log('[DigitalBin] Successfully created location:', newLocation);
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
        
        // Update existing location - locationId always refers to bin_locations here,
        // since it was resolved (or migrated) from that table above
        const { error: updateError } = await supabase
          .from('bin_locations')
          .update({
            location_name: formData.location_name || 'Home',
            address: formData.address || '',
            coordinates: `POINT(${longitude} ${latitude})`, // PostGIS Point format: POINT(lng lat)
            is_default: formData.is_default || false
          })
          .eq('id', locationId);

        if (updateError) {
          throw new Error(`Error updating location: ${updateError.message}`);
        }
      }

      // The QR must carry the DIGITAL BIN id: the collector decodes ".../bin/<uuid>"
      // and matches it against digital_bins.id. Keying it off the location was
      // wrong — one location is reused across bookings at the same address, so
      // two bins there produced identical QR codes.
      // The id is minted here rather than left to the database default so the
      // URL is correct at insert time; a trigger enforces the same value server
      // side for every other writer.
      const binId = crypto.randomUUID();
      const qrCodeUrl = `https://app.trashdrops.com/bin/${binId}`;

      // Every request is a single collection (repeats come from reminders), so
      // it stays open for a week from its collection date, not from today
      const expiryDate = new Date();
      if (formData.startDate) {
        const [year, month, day] = formData.startDate.split('-').map(Number);
        const collectionDay = new Date(year, month - 1, day, 23, 59, 59);
        if (collectionDay > expiryDate) expiryDate.setTime(collectionDay.getTime());
      }
      expiryDate.setDate(expiryDate.getDate() + 7);

      // SERVER-FIRST: Always try to create in database first
      debug.log('[DigitalBin] Creating digital bin in database');
      debug.log('[DigitalBin] Location ID:', locationId);
      debug.log('[DigitalBin] User ID:', user.id);
      
      // Prepare digital bin data with calculated fees
      // Ensure bag_count is always an integer
      const bagCount = parseInt(formData.numberOfBags || formData.bag_count) || 1;

      // digital_bins has no column for the requested start date or time window,
      // so they ride along with the user's notes in the details text
      const schedulePreference = [
        formData.startDate ? `Preferred date: ${formData.startDate}` : null,
        formData.preferredTime
          ? `Preferred time: ${PREFERRED_TIME_LABELS[formData.preferredTime] || formData.preferredTime}`
          : null
      ].filter(Boolean).join(' • ');

      const details = [schedulePreference, formData.notes?.trim()]
        .filter(Boolean)
        .join('\n') || null;
      
      // Fetch promotional fee for the selected bin size if eligible
      let promoFeeData = { clientFee: null, collectorPayout: null, platformSubsidy: null };
      if (promoState.isEligible && !formData.is_urgent) {
        promoFeeData = await getPromotionalFee(formData.bin_size_liters);
        console.log('[DigitalBin] Promotional fee for', formData.bin_size_liters, 'L:', promoFeeData);
      }

      const digitalBinData = await prepareDigitalBinData({
        id: binId,
        user_id: user.id,
        location_id: locationId,
        qr_code_url: qrCodeUrl,
        frequency: formData.frequency,
        waste_type: formData.wasteType || formData.waste_type,
        bag_count: bagCount,
        bin_size_liters: formData.bin_size_liters,
        is_urgent: formData.is_urgent || false,
        expires_at: expiryDate.toISOString(),
        details,
        latitude: formData.latitude,
        longitude: formData.longitude,
        // Promotional pricing fields
        is_promotional: promoState.isEligible && !formData.is_urgent && promoFeeData.clientFee != null,
        promo_request_number: promoState.isEligible && !formData.is_urgent ? promoState.usedCount + 1 : null,
        promotional_client_fee: promoFeeData.clientFee,
        promotional_collector_payout: promoFeeData.collectorPayout,
        promotional_platform_subsidy: promoFeeData.platformSubsidy
      });
      
      debug.log('[DigitalBin] Digital bin data with fees:', digitalBinData);
      debug.log('[DigitalBin] Bag count being sent:', bagCount, '(from numberOfBags:', formData.numberOfBags, 'or bag_count:', formData.bag_count, ')');
      debug.log('[DigitalBin] Status being sent:', digitalBinData.status);
      
      const { data: binData, error: binError} = await supabase
        .from('digital_bins')
        .insert(digitalBinData)
        .select()
        .single();

      if (binError) {
        console.error('[DigitalBin] Database insert failed:', binError);
        // TDC01: the database's coverage trigger refused a location outside
        // every service area (the location step's check was skipped or stale)
        if (binError.code === 'TDC01') {
          throw new Error("We haven't started operating at this location yet, so we can't take a pickup request here.");
        }
        throw new Error(`Failed to create digital bin: ${binError.message}`);
      }
      
      if (!binData) {
        console.error('[DigitalBin] No data returned from insert');
        throw new Error('No data returned from digital bin creation');
      }
      
      debug.log('[DigitalBin] Successfully created digital bin:', binData);

      // The database prices the bin and uses up the promotion when it saves it
      // (td_price_digital_bin); follow what it stored
      if (binData.is_promotional && binData.promo_request_number) {
        setPromoState(prev => ({
          ...prev,
          usedCount: binData.promo_request_number,
          isEligible: binData.promo_request_number < prev.maxRequests
        }));
      }

      // Fire-and-forget background photo upload — does NOT block UI or success flow
      const photoBlobUrls = (formData.photos || []).filter(p => p && (p.startsWith('blob:') || p.startsWith('data:')));
      if (photoBlobUrls.length > 0) {
        const userId = user.id;
        console.log('[DigitalBin] Scheduling background upload of', photoBlobUrls.length, 'photo(s) for bin:', binId);
        uploadPhotos(photoBlobUrls, userId).then(uploadResult => {
          if (uploadResult.success && uploadResult.publicUrls.length > 0) {
            console.log('[DigitalBin] Background photos uploaded:', uploadResult.publicUrls);
            supabase
              .from('digital_bins')
              .update({ photo_urls: uploadResult.publicUrls })
              .eq('id', binId)
              .then(({ error: photoUpdateError }) => {
                if (photoUpdateError) {
                  console.warn('[DigitalBin] Could not save photo URLs to bin record:', photoUpdateError.message);
                } else {
                  console.log('[DigitalBin] photo_urls saved to digital_bins row (background)');
                }
              });
          } else {
            console.warn('[DigitalBin] Background photo upload partially failed:', uploadResult);
          }
        }).catch(err => {
          console.warn('[DigitalBin] Background photo upload error (non-fatal):', err.message);
        });
      }

      // Repeat collections: answer the reminder this booking came from, or
      // save a reminder plan for the next ones. The booking itself is done,
      // so a failure here only costs the reminder.
      let remindersOn = false;
      const fromReminder = reminderRef.current;
      reminderRef.current = null;
      if (fromReminder) {
        answerReminder(fromReminder, 'booked', binData.id)
          .catch(err => console.warn('[DigitalBin] Could not mark the reminder as booked:', err.message));
      } else if (isRepeatFrequency(formData.frequency)) {
        try {
          await createReminderPlan({
            binId: binData.id,
            startDate: formData.startDate,
            preferredTime: formData.preferredTime,
            notes: formData.notes?.trim()
          });
          remindersOn = true;
        } catch (err) {
          console.warn('[DigitalBin] Reminder plan not saved:', err.message);
          toastService.error("Your request is booked, but we couldn't set up reminders for the next collections.");
        }
      }

      // Store the newly created bin ID for auto-expand in the list
      setNewlyCreatedBinId(binData.id);
      debug.log('[DigitalBin] Set newlyCreatedBinId:', binData.id);

      // Put the new bin in the list before we switch views. The confirmation
      // tells the user their QR code is waiting below, so the row has to be
      // there the moment they land - not after a round-trip that can be slow
      // or fail. The server refresh below reconciles it.
      const optimisticBin = transformBin({
        ...binData,
        location_id: binData.location_id || locationId,
        location_name: formData.location_name,
        address: formData.address
      });
      setScheduledPickups(prev => [
        optimisticBin,
        ...prev.filter(bin => bin.id !== optimisticBin.id)
      ]);
      setLastUpdated(new Date());

      // Snapshot what was requested before resetForm() clears formData
      const confirmation = {
        binCount: bagCount,
        binSize: formData.bin_size_liters,
        wasteType: WASTE_TYPE_LABELS[formData.wasteType || formData.waste_type]
          || formData.wasteType || formData.waste_type,
        frequency: formData.frequency,
        startDate: formData.startDate,
        preferredTime: PREFERRED_TIME_LABELS[formData.preferredTime] || formData.preferredTime,
        isUrgent: !!formData.is_urgent,
        remindersOn
      };

      // Reset form and update UI
      resetForm();
      setCurrentStep(1);
      setViewMode('list');

      // Show success message - toast plus a persistent inline confirmation
      setSubmissionSuccess(confirmation);
      toastService.success('Digital bin created successfully!');

      // SERVER-FIRST: reconcile with the server in the background. Silent on
      // failure - the optimistic row stays put rather than following a success
      // message with a fetch error for a bin that was created just fine.
      fetchScheduledPickups(user.id, { silent: true })
        .then(bins => {
          if (bins?.length > 0 && !bins.some(bin => bin.id === optimisticBin.id)) {
            debug.log('[DigitalBin] New bin missing from server refresh, keeping optimistic row');
            setScheduledPickups([optimisticBin, ...bins]);
          }
        })
        .catch(err => {
          console.warn('[DigitalBin] Post-create refresh failed, keeping optimistic row:', err.message);
        });
    } catch (error) {
      console.error('Error in form submission:', error);
      setError(error.message);
      toastService.error(error.message || 'Failed to create digital bin');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Reset form helper
  const resetForm = () => {
    try {
      setFormData({
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
        
        // Waste details (both UI and DB field names)
        numberOfBags: 1,
        bag_count: 1,
        wasteType: 'general',
        waste_type: 'general',
        bin_size_liters: 120,
        is_urgent: false,
        
        // Additional info
        notes: '',
        photos: [],
        
        // Internal state
        savedLocations: formData.savedLocations,
        isNewLocation: true,
        
        // GPS accuracy tracking
        gps_accuracy: null
      });

      setCurrentStep(1);
      setViewMode('list');
    } catch (error) {
      console.error('Error in form reset:', error);
      setError(error.message);
    }
  };

  // Show loading spinner while auth is loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-td-cream dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-td-sage dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  const showGps = currentStep < 5 && formData.latitude && formData.longitude;

  return (
    <div className="max-w-3xl mx-auto px-2 pb-24">
      {viewMode === 'list' ? (
        /* List View */
        <div className="animate-fadeIn space-y-4">
          <PageHeader
            title="My Digital Bins"
            subtitle="Scheduled bin pickups and their QR codes. Show the code to the collector on pickup day."
          />

          <button
            type="button"
            onClick={() => {
              setSubmissionSuccess(null);
              setViewMode('create');
            }}
            className={`${primaryButton} w-full`}
          >
            <FaPlus aria-hidden="true" />
            New Digital Bin
          </button>

          {submissionSuccess && (
            <section className={`${card} px-4 py-4`} role="status" aria-live="polite">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[17px] font-bold text-td-ink dark:text-gray-100">
                    Request submitted
                  </p>
                  <p className="text-sm text-td-sage dark:text-gray-300 mt-1">
                    {submissionSuccess.binCount} {getBinSizeLabelShort(submissionSuccess.binSize)} bin
                    {submissionSuccess.binCount > 1 ? 's' : ''} for {submissionSuccess.wasteType}
                    {submissionSuccess.startDate ? `, starting ${submissionSuccess.startDate}` : ''}
                    {submissionSuccess.preferredTime ? ` (${submissionSuccess.preferredTime})` : ''}
                    {submissionSuccess.isUrgent ? ' · marked urgent' : ''}.
                  </p>
                  <p className="text-sm text-td-sage dark:text-gray-300 mt-1">
                    Your QR code is ready below - print or show it to the collector on pickup day.
                  </p>
                  {submissionSuccess.remindersOn && (
                    <p className="text-sm text-td-sage dark:text-gray-300 mt-1" data-testid="reminders-on">
                      We'll remind you in the app the day before each {
                        { weekly: 'weekly', biweekly: 'bi-weekly', monthly: 'monthly' }[submissionSuccess.frequency]
                      } collection, so you can book it.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSubmissionSuccess(null)}
                  className="w-9 h-9 -mt-1 -mr-1 rounded-full flex items-center justify-center text-td-sage dark:text-gray-300 hover:bg-td-cream dark:hover:bg-gray-700 flex-shrink-0"
                  aria-label="Dismiss confirmation"
                >
                  <FaTimes aria-hidden="true" />
                </button>
              </div>
            </section>
          )}

          <ScheduledQRTab 
            scheduledPickups={scheduledPickups} 
            onRefresh={handleRefresh}
            isLoading={isLoading}
            newlyCreatedBinId={newlyCreatedBinId}
            onNewBinExpanded={() => setTimeout(() => setNewlyCreatedBinId(null), 3000)}
          />
        </div>
      ) : (
        /* Create View */
        <div className="animate-fadeIn space-y-4">
          <PageHeader
            title="Create Digital Bin"
            subtitle="Schedule pickups for your bin and get a QR code for the collector."
          />

          {/* Progress through the five steps */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-sm font-semibold text-td-ink dark:text-gray-100">
                Step {currentStep} of 5 <span className="text-td-sage dark:text-gray-300 font-normal">· {getStepTitle(currentStep)}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  // Leaving a booking started from a reminder: the reminder
                  // stays open, and the next new bin starts from a clean form
                  if (reminderRef.current) {
                    reminderRef.current = null;
                    resetForm();
                  }
                  setViewMode('list');
                  setCurrentStep(1);
                }}
                className="text-sm font-semibold text-td-forest dark:text-green-300 hover:underline"
              >
                Cancel
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1.5" role="progressbar" aria-label="Digital bin form progress" aria-valuemin={1} aria-valuemax={5} aria-valuenow={currentStep}>
              {[1, 2, 3, 4, 5].map(step => (
                <span
                  key={step}
                  className={`h-1.5 rounded-full ${currentStep >= step ? 'bg-td-forest dark:bg-green-400' : 'bg-td-border dark:bg-gray-700'}`}
                ></span>
              ))}
            </div>
          </div>
          
          {/* GPS Accuracy Indicator - shows during pages 1-4 when we have coordinates */}
          {showGps && (
            <div className={`${infoNote} px-3.5 py-2 flex items-center justify-between text-sm`}>
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${isRefining ? 'bg-amber-500 animate-pulse' : 'bg-td-forest dark:bg-green-400'}`} aria-hidden="true"></span>
                <span>
                  GPS Accuracy: {formData.gps_accuracy ? `${formData.gps_accuracy.toFixed(1)}m` : 'Measuring...'}
                </span>
              </div>
              {(isRefining || refinementCount > 0) && (
                <span className="text-xs font-semibold">
                  {isRefining ? 'Refining...' : `✓ Improved ${refinementCount}x`}
                </span>
              )}
            </div>
          )}
          
          {/* Form steps */}
          <div>
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
                promoState={promoState}
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
                promoState={promoState}
              />
            )}
          </div>
          
          {/* Link to one-time pickup */}
          {currentStep === 5 && (
            <div className="text-center">
              <a href="/pickup-request" className="text-sm font-semibold text-td-forest dark:text-green-300 hover:underline">
                Need a one-time pickup? Request here
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DigitalBin;
