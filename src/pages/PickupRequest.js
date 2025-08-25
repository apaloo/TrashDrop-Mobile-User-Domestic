import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../context/AuthContext.js';
import supabase from '../utils/supabaseClient.js';
import LoadingSpinner from '../components/LoadingSpinner.js';
import appConfig from '../utils/app-config.js';
import GeolocationService from '../utils/geolocationService.js';
import { subscribeToStatsUpdates } from '../utils/realtime.js';

// Location marker component with draggable functionality
const LocationMarker = ({ position, setPosition }) => {
  const map = useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });

  return position ? 
    <Marker 
      position={position} 
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const marker = e.target;
          const position = marker.getLatLng();
          setPosition([position.lat, position.lng]);
        },
      }}
    /> : null;
};

/**
 * Form for requesting trash pickup
 */
const PickupRequest = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({
    savedLocationId: '',
    numberOfBags: '1',
    priority: 'normal',
    wasteType: 'general',
    notes: '',
    location: {
      lat: appConfig.maps.defaultCenter.lat,
      lng: appConfig.maps.defaultCenter.lng,
    },
  });
  const [position, setPosition] = useState([
    appConfig.maps.defaultCenter.lat,
    appConfig.maps.defaultCenter.lng,
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [savedLocations, setSavedLocations] = useState([]);
  const [userStats, setUserStats] = useState(() => {
    // Initialize from test override if present to stabilize first render in tests
    return { totalBags: 0, batches: 0 };
  });
  const [insufficientBags, setInsufficientBags] = useState(false);
  // Keep latest userId in a ref for event handlers registered once
  const userIdRef = useRef(user?.id ?? null);
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);
  
  // Keep latest available bags in a ref so validation schema can read it without remounting Formik
  const availableBagsRef = useRef(userStats.totalBags || 0);
  useEffect(() => {
    availableBagsRef.current = userStats.totalBags || 0;
  }, [userStats.totalBags]);

  // Schema for form validation (constant reference to avoid Formik subtree remounts)
  const validationSchema = useMemo(() => Yup.object().shape({
    savedLocationId: Yup.string().nullable(),
    numberOfBags: Yup.number()
      .typeError('Please enter a valid number')
      .integer('Number of bags must be an integer')
      .min(1, 'Minimum 1 bag required')
      .max(10, 'Maximum 10 bags allowed')
      .test('enough-bags', function (value) {
        const max = Number(availableBagsRef.current || 0);
        if (!Number.isFinite(value)) return true;
        if (value > max) {
          return this.createError({ message: `You only have ${max} bag(s) available` });
        }
        return true;
      })
      .required('Number of bags is required'),
    priority: Yup.string().oneOf(['normal', 'urgent', 'low']).required('Priority is required'),
    wasteType: Yup.string().oneOf(['general', 'recycling', 'plastic', 'organic']).required('Waste type is required'),
    notes: Yup.string().max(500, 'Notes must be at most 500 characters'),
  }), []);
  
  // Debug: log userStats changes during tests
  useEffect(() => {
    console.log('[PickupRequest] userStats.totalBags now', userStats.totalBags);
  }, [userStats.totalBags]);

  // Compute submit disabled state once per render
  const submitDisabled = isSubmitting || userStats.totalBags <= 0;
  if (typeof window !== 'undefined') {
    console.log('[PickupRequest] computed submitDisabled', submitDisabled);
    console.log('[PickupRequest] render state', {
      totalBags: userStats.totalBags,
      insufficientBags,
      submitDisabled,
    });
  }
  
  // Load saved locations from Supabase when component mounts
  useEffect(() => {
    const loadSavedLocations = async () => {
      if (!user) return;
      
      // Clear any existing saved locations in state (not localStorage)
      setSavedLocations([]);
      
      try {
        // First check localStorage for immediate display
        const cachedLocations = localStorage.getItem('trashdrop_locations');
        if (cachedLocations) {
          const parsedLocations = JSON.parse(cachedLocations);
          console.log('Loaded locations from local storage:', parsedLocations);
          setSavedLocations(parsedLocations);
        }
        
        // Then fetch from Supabase to ensure we have the latest
        const { data: locationsData, error: locationsError } = await supabase
          .from('locations') // Use the correct table name
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        if (locationsError) throw locationsError;
        
        if (locationsData && locationsData.length > 0) {
          // Format locations to match component's expected structure
          const formattedLocations = locationsData.map(location => ({
            id: location.id,
            name: location.name,
            address: location.address || '',
            city: location.city || '',
            latitude: location.latitude,
            longitude: location.longitude,
            synced: true
          }));
          
          console.log('Loaded user locations from Supabase:', formattedLocations);
          
          // Merge with local storage data for any offline-saved locations
          const cachedLocations = localStorage.getItem('trashdrop_locations');
          const localLocations = cachedLocations ? JSON.parse(cachedLocations) : [];
          
          // Identify any local-only locations (ones not synced to server yet)
          const localOnlyLocations = localLocations.filter(
            local => local.id.toString().startsWith('local_') && 
                     !formattedLocations.some(server => 
                        server.name === local.name && server.address === local.address)
          );
          
          // Combine server locations with any local-only locations
          const mergedLocations = [...formattedLocations, ...localOnlyLocations];
          
          // Update state with all locations
          setSavedLocations(mergedLocations);
          
          // Keep localStorage in sync
          localStorage.setItem('trashdrop_locations', JSON.stringify(mergedLocations));
        } else {
          // Check if we already have locations in localStorage
          const cachedLocations = localStorage.getItem('trashdrop_locations');
          if (!cachedLocations) {
            console.log('No saved locations found for user');
          }
        }
      } catch (error) {
        console.error('Error loading saved locations:', error);
      }
    };
    
    loadSavedLocations();
    
    // Setup real-time subscription for saved locations
    const subscription = supabase
      .channel('locations_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'locations', filter: `user_id=eq.${user?.id}` },
        () => {
          loadSavedLocations();
        }
      )
      .subscribe();

    // Add event listener to refresh locations when localStorage changes
    // This helps synchronize data between tabs/windows
    const handleStorageChange = (e) => {
      if (e.key === 'trashdrop_locations') {
        loadSavedLocations();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    // Cleanup both subscription and storage listener on unmount
    return () => {
      try { subscription.unsubscribe(); } catch (_) {}
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [user?.id]);

  // Update position when form location changes or saved location is selected
  useEffect(() => {
    if (formData.savedLocationId) {
      const selectedLocation = savedLocations.find(loc => loc.id === formData.savedLocationId);
      if (selectedLocation) {
        // Use the new latitude/longitude properties
        setPosition([selectedLocation.latitude, selectedLocation.longitude]);
        setFormData(prev => ({
          ...prev,
          location: {
            lat: selectedLocation.latitude,
            lng: selectedLocation.longitude,
          },
        }));
      }
    } else {
      setPosition([formData.location.lat, formData.location.lng]);
    }
  }, [formData.location, formData.savedLocationId, savedLocations]);

  // Fetch user stats to check available bags
  useEffect(() => {
    const fetchUserStats = async () => {
      if (user && user.id) {
        try {
          const { data: statsData, error: statsError } = await supabase
            .from('user_stats')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();
            
          if (statsError) throw statsError;
          
          if (statsData) {
            console.log('[PickupRequest] fetchUserStats loaded', statsData);
            const scannedLen = Array.isArray(statsData.scanned_batches) ? statsData.scanned_batches.length : undefined;
            const totalBagsVal = (statsData.available_bags !== undefined)
              ? statsData.available_bags
              : ((statsData.total_bags !== undefined)
                  ? statsData.total_bags
                  : (statsData.total_bags_scanned !== undefined ? statsData.total_bags_scanned : (scannedLen !== undefined ? scannedLen : 0)));
            const totalBatchesVal = (statsData.total_batches !== undefined)
              ? statsData.total_batches
              : (scannedLen !== undefined ? scannedLen : 0);

            const mergedTotalBags = (statsData.total_bags !== undefined)
              ? statsData.total_bags
              : (scannedLen !== undefined ? scannedLen : 0);

            // Avoid clobbering optimistic increases from 'trashdrop:bags-updated'
            setUserStats(prev => {
              const next = { totalBags: mergedTotalBags, batches: totalBatchesVal };
              setInsufficientBags(mergedTotalBags <= 0);
              return next;
            });
          }
        } catch (error) {
          console.error('Error fetching user stats:', error);
        }
      }
    };
    
    fetchUserStats();
  }, [user]);

  // Subscribe to real-time stats updates so bag counts stay in sync after scans
  useEffect(() => {
    if (!user?.id) return;

    const subscription = subscribeToStatsUpdates(user.id, (tableType, payload) => {
      if (tableType !== 'user_stats') return;
      const newRec = payload?.new;
      if (!newRec) return;

      const scannedLen = Array.isArray(newRec.scanned_batches) ? newRec.scanned_batches.length : undefined;
      const totalBags = (newRec.available_bags !== undefined)
        ? newRec.available_bags
        : ((newRec.total_bags !== undefined)
            ? newRec.total_bags
            : (newRec.total_bags_scanned !== undefined ? newRec.total_bags_scanned : (scannedLen !== undefined ? scannedLen : 0)));
      const totalBatches = (newRec.total_batches !== undefined)
        ? newRec.total_batches
        : (scannedLen !== undefined ? scannedLen : 0);
      // Avoid clobbering optimistic increases; merge with existing state like fetchUserStats
      setUserStats(prev => {
        const mergedTotalBags = Math.max(prev?.totalBags ?? 0, totalBags ?? 0);
        const next = { totalBags: mergedTotalBags, batches: totalBatches };
        setInsufficientBags(mergedTotalBags <= 0);
        return next;
      });
    });

    return () => {
      subscription?.unsubscribe?.();
    };
  }, [user?.id]);

  // Optimistic update from BatchQRScanner via global event
  // Register once and read latest userId via ref to avoid stale closures
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[PickupRequest] registering global listener: trashdrop:bags-updated');
    }
    const handler = (e) => {
      const { userId, deltaBags } = e?.detail || {};
      if (!userId || userId !== userIdRef.current) return;
      const delta = Number(deltaBags);
      if (!Number.isFinite(delta) || delta === 0) return;
      console.log('[PickupRequest] trashdrop:bags-updated received', { userId, delta });
      setUserStats(prev => {
        const updated = { ...prev, totalBags: Math.max(0, (prev.totalBags || 0) + delta) };
        setInsufficientBags(updated.totalBags <= 0);
        console.log('[PickupRequest] Updated userStats via event', updated);
        return updated;
      });
    };
    window.addEventListener('trashdrop:bags-updated', handler);
    return () => {
      if (typeof window !== 'undefined') {
        console.log('[PickupRequest] unregistering global listener: trashdrop:bags-updated');
      }
      window.removeEventListener('trashdrop:bags-updated', handler);
    };
  }, []);

  // Local-first helpers for pickup requests
  const getPendingPickups = () => {
    try {
      return JSON.parse(localStorage.getItem('trashdrop_pickups') || '[]');
    } catch (_) { return []; }
  };

  const savePendingPickups = (arr) => {
    try { localStorage.setItem('trashdrop_pickups', JSON.stringify(arr)); } catch (_) {}
  };

  const queueLocalPickup = (pickup) => {
    const list = getPendingPickups();
    list.unshift(pickup);
    savePendingPickups(list);
  };

  const markPickupSynced = (localId, serverId) => {
    const list = getPendingPickups();
    const idx = list.findIndex(p => p.id === localId);
    if (idx !== -1) {
      list[idx].synced = true;
      list[idx].server_id = serverId;
      savePendingPickups(list);
    }
  };

  const syncSinglePickup = async (pickup) => {
    try {
      // Strip local-only fields
      const { id, synced, server_id, ...dbPayload } = pickup;
      const { data, error } = await supabase
        .from('pickups')
        .insert([dbPayload])
        .select('id')
        .single();
      if (error) throw error;

      // Decrement available bags on server
      const bagsToRemove = Number(pickup.number_of_bags || pickup.numberOfBags || 0);
      const { error: statsError } = await supabase.rpc('decrement_user_bags', {
        user_id_param: pickup.user_id,
        bags_to_remove: bagsToRemove
      });
      if (statsError) {
        // Fallback: directly update user_stats.available_bags
        try {
          const { data: statsRow } = await supabase
            .from('user_stats')
            .select('*')
            .eq('user_id', pickup.user_id)
            .maybeSingle();

          const currentAvailable = Number(statsRow?.available_bags || 0);
          const newAvailable = Math.max(0, currentAvailable - bagsToRemove);

          await supabase
            .from('user_stats')
            .upsert({
              user_id: pickup.user_id,
              available_bags: newAvailable,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
        } catch (e) {
          console.warn('Fallback stats update failed during background sync', e);
        }
      }

      markPickupSynced(id, data?.id);
      try {
        window.dispatchEvent(new CustomEvent('trashdrop:pickup-synced', { detail: { localId: id, serverId: data?.id } }));
      } catch (_) {}
    } catch (err) {
      console.warn('Background sync of pickup failed; will retry later', err);
    }
  };

  // Attempt to sync any pending pickups on mount and when back online
  useEffect(() => {
    const syncAll = async () => {
      const pending = getPendingPickups().filter(p => !p.synced && p.user_id === user?.id);
      for (const p of pending) {
        // eslint-disable-next-line no-await-in-loop
        await syncSinglePickup(p);
      }
    };
    if (user?.id) {
      syncAll();
    }
    const handleOnline = () => { if (user?.id) syncAll(); };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [user?.id]);

  // Handle map position updates
  const handlePositionChange = (newPosition) => {
    setPosition(newPosition);
    setFormData(prev => ({
      ...prev,
      savedLocationId: '', // Clear selected location when map is manually updated
      location: {
        lat: newPosition[0],
        lng: newPosition[1],
      }
    }));
  };

  // Handle form submission
  const handleSubmit = async (values, { setSubmitting, resetForm }) => {
    setIsSubmitting(true);
    setError('');
    
    try {
      if (!user || !user.id) {
        throw new Error('You must be logged in to request a pickup');
      }
      
      // Check if the user has enough bags for this request
      if (userStats.totalBags < Number(values.numberOfBags)) {
        throw new Error(`You don't have enough bags. You have ${userStats.totalBags} bag(s), but requested ${values.numberOfBags}.`);
      }
      
      // Format the pickup data
      const pickupData = {
        user_id: user.id,
        status: 'waiting_for_collector',
        number_of_bags: Number(values.numberOfBags),
        waste_type: values.wasteType,
        priority: values.priority,
        notes: values.notes,
        location: `POINT(${values.location.lng} ${values.location.lat})`,
        address: values.address || 'Custom location',
        created_at: new Date().toISOString(),
      };

      // Local-first: queue immediately and optimistically update UI
      const localId = `local_${Date.now()}`;
      const localPickup = { id: localId, ...pickupData, synced: false };
      try { queueLocalPickup(localPickup); } catch (_) {}

      // Optimistically update user's available bags locally
      const bagsToRemove = Number(values.numberOfBags);
      setUserStats(prev => ({
        ...prev,
        totalBags: Math.max(0, (prev.totalBags || 0) - bagsToRemove)
      }));

      // Success - show confirmation and clear form
      setSuccess(true);
      resetForm();

      // Start background sync (non-blocking)
      syncSinglePickup(localPickup);
      
      // Automatically redirect after 3 seconds
      setTimeout(() => {
        navigate('/');
      }, 3000);
    } catch (error) {
      console.error('Error submitting pickup request (local-first):', error);
      setError(error.message || 'Failed to submit pickup request. Please try again.');
    } finally {
      setIsSubmitting(false);
      setSubmitting(false);
    }
  };

  // If submission was successful, show success message
  if (success) {
    return (
      <div className="max-w-md mx-auto bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 mb-4">
            <svg className="w-8 h-8 text-green-600 dark:text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Pickup Request Submitted!</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Your request has been received. We'll notify you when the pickup is scheduled.
          </p>
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md mb-6">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Location: {formData.savedLocationId ? savedLocations.find(loc => loc.id === formData.savedLocationId)?.name : 'Custom Location'}
              <br />
              Number of Bags: {formData.numberOfBags}
              <br />
              Priority: {formData.priority}
              <br />
              Waste Type: {formData.wasteType === 'general' ? 'General Waste' : 
                        formData.wasteType === 'recycling' ? 'Recycling' : 
                        formData.wasteType === 'plastic' ? 'Plastic' : 'Organic Waste'}
            </p>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-dark transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden mb-20 md:mb-0 pt-2"> {/* Reduced padding-top to 0.5rem */}
      {/* Fixed Header (positioned below navbar) */}
      <div className="p-4 bg-white dark:bg-gray-800 fixed top-16 left-0 right-0 z-40 shadow-md max-w-2xl mx-auto rounded-t-lg">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white text-center">
          Request Pickup
        </h1>
      </div>
      
      <div className="p-6 pt-0"> {/* Adjusted padding-top to 0 since we have the fixed header now */}
        
        {/* Display bag availability information */}
        <div className="mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            You have <span className="font-bold">{userStats.totalBags}</span> bag(s) available for pickup.
          </p>
        </div>
        
        {insufficientBags && (
          <div className="bg-yellow-100 dark:bg-yellow-900 p-4 rounded-md text-yellow-700 dark:text-yellow-200 mb-4">
            <p>You don't have any bags available. Please purchase bags to continue OR use the Digital Bin module.</p>
            <div className="mt-3 flex space-x-4">
              <button 
                className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors"
                onClick={() => navigate('/store')}
              >
                Purchase Bags
              </button>
              <button 
                className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 transition-colors"
                onClick={() => navigate('/digital-bin')}
              >
                Digital Bin
              </button>
            </div>
          </div>
        )}
        
        {/* Success path returns earlier above. Always show helper box. */}
        <div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center text-blue-600">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">Important:</span>
            </div>
            <p className="ml-7 text-blue-700">Select your pickup location by clicking on the map or choosing from your saved locations.</p>
          </div>
        </div>
        
        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded relative mb-4" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        
        <Formik
          initialValues={formData}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          {({ values, setFieldValue, isValid, dirty, errors, touched }) => (
            <Form className="space-y-6">
              {/* Pickup Location Section */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
                <div className="p-4">
                  <h2 className="text-xl font-medium text-gray-800 dark:text-white mb-4">Pickup Location</h2>
                  
                  <div className="mb-4">
                    <label htmlFor="savedLocationId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Select from Saved Locations <span className="text-red-600">*</span>
                    </label>
                    <Field
                      as="select"
                      id="savedLocationId"
                      name="savedLocationId"
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white rounded-md"
                    >
                      <option value="" className="text-gray-900 dark:text-white font-medium">-- Select a saved location --</option>
                      {savedLocations.map(location => (
                        <option key={location.id} value={location.id}>{location.name} - {location.address}</option>
                      ))}
                    </Field>
                    {touched.savedLocationId && errors.savedLocationId && (
                      <div className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.savedLocationId}</div>
                    )}
                    <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      You can select from your saved locations or <a href="/profile" className="text-blue-600 hover:underline">add new locations</a>
                    </div>
                  </div>
                  
                  <div>
                    <div className="h-72 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700">
                      <MapContainer 
                        center={position} 
                        zoom={13} 
                        style={{ height: '100%', width: '100%' }}
                      >
                        <TileLayer
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />
                        <LocationMarker position={position} setPosition={handlePositionChange} />
                      </MapContainer>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Pickup Details Section */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
                <div className="p-4">
                  <h2 className="text-xl font-medium text-gray-800 dark:text-white mb-4">Pickup Details</h2>
                  
                  {/* Number of Bags - Dynamic based on available bags */}
                  <div className="mb-4">
                    <label htmlFor="numberOfBags" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Number of Bags <span className="text-red-600">*</span>
                      {userStats.totalBags > 0 && (
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                          (You have {userStats.totalBags} bag{userStats.totalBags !== 1 ? 's' : ''} available)
                        </span>
                      )}
                    </label>
                    <Field
                      as="select"
                      id="numberOfBags"
                      name="numberOfBags"
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white rounded-md"
                      disabled={userStats.totalBags <= 0}
                    >
                      {/* Dynamically generate options based on available bags, up to 10 maximum */}
                      {[...Array(Math.min(userStats.totalBags, 10))].map((_, index) => {
                        const bagNumber = index + 1;
                        return (
                          <option key={bagNumber} value={String(bagNumber)}>
                            {bagNumber} Bag{bagNumber !== 1 ? 's' : ''}
                          </option>
                        );
                      })}
                      {userStats.totalBags <= 0 && (
                        <option value="1">No bags available</option>
                      )}
                    </Field>
                    {touched.numberOfBags && errors.numberOfBags && (
                      <div className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.numberOfBags}</div>
                    )}
                    {userStats.totalBags <= 0 && (
                      <>
                        <div className="mt-1 text-sm text-yellow-600 dark:text-yellow-400">
                          You don't have any bags available. Please purchase bags to continue OR use the Digital Bin module.
                          {JSON.stringify(userStats)}
                        </div>
                        <div className="mt-2 flex justify-center space-x-4">
                          <button 
                            className="bg-blue-500 text-white px-3 py-1.5 rounded-md text-sm hover:bg-blue-600 transition-colors cursor-not-allowed opacity-75"
                            onClick={(e) => {
                              e.preventDefault();
                              alert('Coming out soon!');
                            }}
                          >
                            Purchase Bags
                          </button>
                          <button 
                            className="bg-green-500 text-white px-3 py-1.5 rounded-md text-sm hover:bg-green-600 transition-colors"
                            onClick={() => navigate('/digital-bin')}
                          >
                            Digital Bin
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Priority */}
                  <div className="mb-4">
                    <label htmlFor="priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Priority <span className="text-red-600">*</span>
                    </label>
                    <Field
                      as="select"
                      id="priority"
                      name="priority"
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white rounded-md"
                    >
                      <option value="normal" className="text-gray-900 dark:text-white font-medium">Normal</option>
                      <option value="urgent">Urgent</option>
                      <option value="low">Low Priority</option>
                    </Field>
                    {touched.priority && errors.priority && (
                      <div className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.priority}</div>
                    )}
                  </div>
                  
                  {/* Waste Type */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Waste Type <span className="text-red-600">*</span>
                    </label>
                    
                    <div className="mt-2 space-y-2">
                      <label className="inline-flex items-center">
                        <Field 
                          type="radio" 
                          name="wasteType" 
                          value="general" 
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                        />
                        <span className="ml-2 text-gray-700 dark:text-gray-300">General Waste</span>
                      </label>
                      
                      <div className="block">
                        <label className="inline-flex items-center">
                          <Field 
                            type="radio" 
                            name="wasteType" 
                            value="recycling" 
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                          />
                          <span className="ml-2 text-gray-700 dark:text-gray-300">Recycling</span>
                        </label>
                      </div>
                      
                      <div className="block">
                        <label className="inline-flex items-center">
                          <Field 
                            type="radio" 
                            name="wasteType" 
                            value="plastic" 
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                          />
                          <span className="ml-2 text-gray-700 dark:text-gray-300">Plastic</span>
                        </label>
                      </div>
                      
                      <div className="block">
                        <label className="inline-flex items-center">
                          <Field 
                            type="radio" 
                            name="wasteType" 
                            value="organic" 
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                          />
                          <span className="ml-2 text-gray-700 dark:text-gray-300">Organic Waste</span>
                        </label>
                      </div>
                    </div>
                    
                    {touched.wasteType && errors.wasteType && (
                      <div className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.wasteType}</div>
                    )}
                    
                    <div className="mt-2 flex items-start text-sm text-gray-600 dark:text-gray-400">
                      <svg className="flex-shrink-0 h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
                      </svg>
                      <p>Earn reward points by properly segregating recycling and plastic waste!</p>
                    </div>
                  </div>
                  
                  {/* Additional Notes */}
                  <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Additional Notes (Optional)
                    </label>
                    <Field
                      as="textarea"
                      id="notes"
                      name="notes"
                      rows={3}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                      placeholder="Any other information for the collector"
                    />
                    {touched.notes && errors.notes && (
                      <div className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.notes}</div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Pricing & Rewards Section */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
                <div className="p-4">
                  <h2 className="text-xl font-medium text-gray-800 dark:text-white mb-4">Pricing & Rewards</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">No standard pickup fee</p>
                </div>
              </div>
              {userStats.totalBags <= 0 && (
                <div className="text-sm text-yellow-700 bg-yellow-100 border border-yellow-300 rounded-md p-3 mb-3" role="alert">
                  No bags available. Scan a batch to enable pickup.
                </div>
              )}
              {/* Submit button */}
              <button
                type="submit"
                className="w-full px-6 py-3 bg-green-600 text-white font-medium text-lg rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                disabled={submitDisabled}
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center">
                    <LoadingSpinner size="sm" />
                    <span className="ml-2">Processing...</span>
                  </div>
                ) : (
                  'Request Pickup'
                )}
              </button>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default PickupRequest;
