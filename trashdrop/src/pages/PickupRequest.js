import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../context/AuthContext.js';
import supabase from '../utils/supabaseClient.js';
import LoadingSpinner from '../components/LoadingSpinner.js';
import OptionTile from '../components/ui/OptionTile.js';
import PageHeader from '../components/ui/PageHeader.js';
import { card, errorNote, infoNote, primaryButton, secondaryButton, sectionTitle, tonalButton, warningNote } from '../components/ui/styles.js';
import appConfig from '../utils/app-config.js';
import GeolocationService from '../utils/geolocationService.js';
import { subscribeToStatsUpdates } from '../utils/realtime.js';
import { userServiceOptimized } from '../services/userServiceOptimized.js';

// Choices on the form
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', icon: '🐢', description: 'Flexible timing' },
  { value: 'normal', label: 'Normal', icon: '📦', description: 'Standard pickup' },
  { value: 'urgent', label: 'Urgent', icon: '⚡', description: 'Priority service' },
];
const WASTE_OPTIONS = [
  { value: 'general', label: 'General', icon: '🗑️', description: 'Mixed waste' },
  { value: 'recycling', label: 'Recycling', icon: '♻️', description: 'Paper, cans' },
  { value: 'plastic', label: 'Plastic', icon: '🥤', description: 'Bottles, bags' },
  { value: 'organic', label: 'Organic', icon: '🍂', description: 'Food, garden' },
];

// Component to handle map view updates when position changes
const MapViewController = ({ position }) => {
  const map = useMap();
  
  useEffect(() => {
    if (position && position.length === 2) {
      // Fly to the new position with smooth animation
      map.flyTo(position, 15, {
        duration: 1.5, // Animation duration in seconds
        easeLinearity: 0.25
      });
    }
  }, [position, map]);
  
  return null;
};

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
  const [requestedBags, setRequestedBags] = useState(0); // Bags already in active pickups
  const [insufficientBags, setInsufficientBags] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  
  // Calculate available bags: total bags - requested bags (never below 0)
  const availableBags = Math.max(0, (userStats.totalBags || 0) - (requestedBags || 0));
  
  // Update insufficientBags based on availableBags
  useEffect(() => {
    setInsufficientBags(availableBags <= 0);
  }, [availableBags]);
  
  // Keep latest userId in a ref for event handlers registered once
  const userIdRef = useRef(user?.id ?? null);
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);
  
  // Keep latest available bags in a ref so validation schema can read it without remounting Formik
  const availableBagsRef = useRef(availableBags);
  useEffect(() => {
    availableBagsRef.current = availableBags;
  }, [availableBags]);

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
    console.log('[PickupRequest] requestedBags now', requestedBags);
    console.log('[PickupRequest] availableBags now', availableBags);
  }, [userStats.totalBags, requestedBags, availableBags]);

  // Compute submit disabled state once per render
  const submitDisabled = isSubmitting || availableBags <= 0;
  if (typeof window !== 'undefined') {
    console.log('[PickupRequest] computed submitDisabled', submitDisabled);
    console.log('[PickupRequest] render state', {
      totalBags: userStats.totalBags,
      requestedBags,
      availableBags,
      insufficientBags,
      submitDisabled,
    });
  }
  
  // Load saved locations from Supabase when component mounts
  useEffect(() => {
    const loadSavedLocations = async () => {
      if (!user) return;
      
      // User-specific cache key
      const cacheKey = `trashdrop_locations_${user.id}`;
      
      // Clear any existing saved locations in state (not localStorage)
      setSavedLocations([]);
      
      try {
        // IMPORTANT: Always fetch fresh from database to ensure we have PostGIS coordinates
        console.log('[PickupRequest] Loading saved locations from database...');
        
        const { data: locationsData, error: locationsError } = await supabase
          .from('locations')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        if (locationsError) {
          console.error('[PickupRequest] Error loading locations:', locationsError);
          throw locationsError;
        }
        
        console.log('[PickupRequest] Raw locations from database:', locationsData);
        
        if (locationsData && locationsData.length > 0) {
          // Format locations to match component's expected structure
          // Format locations - locations table uses separate lat/lng columns
          const formattedLocations = locationsData.map(location => {
            console.log(`[PickupRequest] Processing location "${location.location_name}":`, location);
            
            const formattedLocation = {
              id: location.id,
              name: location.location_name,  // Database column is 'location_name'
              address: location.address || '',
              latitude: location.latitude,
              longitude: location.longitude,
              synced: true
            };
            
            console.log(`[PickupRequest] ✅ Formatted location:`, formattedLocation);
            
            return formattedLocation;
          });
          
          console.log('Loaded user locations from Supabase:', formattedLocations);
          
          // Merge with local storage data for any offline-saved locations (user-specific cache)
          const cachedLocations = localStorage.getItem(cacheKey);
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
          
          // Update localStorage cache with properly parsed coordinates (user-specific cache)
          localStorage.setItem(cacheKey, JSON.stringify(mergedLocations));
          console.log('[PickupRequest] ✅ Saved locations loaded and cached:', mergedLocations.length, 'locations');
        } else {
          console.log('[PickupRequest] No saved locations found in database for user');
          // Clear stale cache (user-specific)
          localStorage.removeItem(cacheKey);
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
      // Check both user-specific and legacy cache keys
      const userCacheKey = user?.id ? `trashdrop_locations_${user.id}` : null;
      if (e.key === userCacheKey || e.key === 'trashdrop_locations') {
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

  // Update position when saved location is selected
  useEffect(() => {
    if (formData.savedLocationId) {
      const selectedLocation = savedLocations.find(loc => loc.id === formData.savedLocationId);
      console.log('[PickupRequest] Selected location from dropdown:', selectedLocation);
      
      if (selectedLocation) {
        const lat = selectedLocation.latitude;
        const lng = selectedLocation.longitude;
        
        console.log('[PickupRequest] Parsed coordinates:', { lat, lng });
        
        // Validate coordinates are valid numbers
        if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
          console.log('[PickupRequest] Setting map position to:', [lat, lng]);
          setPosition([lat, lng]);
          setFormData(prev => ({
            ...prev,
            location: {
              lat: lat,
              lng: lng,
            },
          }));
        } else {
          console.error('[PickupRequest] Invalid coordinates for selected location:', { lat, lng, selectedLocation });
          // Don't update position if coordinates are invalid
        }
      } else {
        console.warn('[PickupRequest] Selected location not found in savedLocations array');
      }
    }
    // IMPORTANT: Don't include formData.location in dependencies - we're updating it here!
    // Only watch for changes to savedLocationId and savedLocations
  }, [formData.savedLocationId, savedLocations]);

  // Fetch user stats to check available bags using the same optimized service as dashboard
  useEffect(() => {
    const fetchUserStats = async () => {
      if (user && user.id) {
        try {
          // Use the same optimized service as dashboard for consistency
          const { data: statsData, error: statsError } = await userServiceOptimized.getUserStatsOptimized(user.id);
            
          if (statsError) throw statsError;
          
          if (statsData) {
            console.log('[PickupRequest] fetchUserStats loaded', statsData);
            // userServiceOptimized returns a different structure: totalBags, batches, etc.
            const totalBagsVal = statsData.totalBags || 0;
            const totalBatchesVal = statsData.batches || 0;

            // Avoid clobbering optimistic increases from 'trashdrop:bags-updated'
            setUserStats(prev => {
              const next = { totalBags: totalBagsVal, batches: totalBatchesVal };
              setInsufficientBags(totalBagsVal <= 0);
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

  // Fetch active pickup requests to calculate already-requested bags
  useEffect(() => {
    const fetchRequestedBags = async () => {
      if (!user || !user.id) return;
      
      try {
        // Fetch all active pickup requests (pending, accepted, en_route)
        // Exclude: completed, cancelled
        const { data: pickupsData, error: pickupsError } = await supabase
          .from('pickup_requests')
          .select('estimated_volume')
          .eq('user_id', user.id)
          .in('status', ['pending', 'accepted', 'en_route', 'arrived', 'collecting']);
        
        if (pickupsError) throw pickupsError;
        
        // Calculate total bags in active pickups
        // NOTE: bag_count is GENERATED ALWAYS AS IDENTITY (auto-increment row counter).
        // The actual user-requested bag count is stored in estimated_volume by the RPC.
        const totalRequestedBags = pickupsData?.reduce((sum, pickup) => {
          return sum + (Number(pickup.estimated_volume) || 0);
        }, 0) || 0;
        
        console.log('[PickupRequest] Requested bags in active pickups:', totalRequestedBags);
        setRequestedBags(totalRequestedBags);
      } catch (error) {
        console.error('Error fetching requested bags:', error);
        setRequestedBags(0); // Default to 0 on error
      }
    };
    
    fetchRequestedBags();
    
    // Setup real-time subscription for pickup_requests changes
    const subscription = supabase
      .channel('pickup_requests_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'pickup_requests', filter: `user_id=eq.${user?.id}` },
        () => {
          fetchRequestedBags(); // Refetch when pickup requests change
        }
      )
      .subscribe();
    
    return () => {
      try { subscription.unsubscribe(); } catch (_) {}
    };
  }, [user?.id]);

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

  // Removed localStorage-based pickup persistence - now using direct database operations

  // Activity tracking removed - recent activities now read directly from pickup_requests table

  // Removed sync logic - no longer needed with direct database operations

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

      console.log('XXXXXXXXXXXXXXXXXXXXXX [PickupRequest] User ID:', user.id);
      
      // Ensure user profile exists in profiles table
      try {
        const { data: existingProfile, error: profileCheckError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .maybeSingle();
          
        if (!existingProfile && !profileCheckError) {
          // Profile doesn't exist, create it
          console.log('XXXXXXXXXXXXXXXXXXXXXX [PickupRequest] Creating user profile');
          const { error: createProfileError } = await supabase
            .from('profiles')
            .insert([{
              id: user.id,
              email: user.email || '',
              created_at: new Date().toISOString()
            }]);
            
          if (createProfileError) {
            console.error('XXXXXXXXXXXXXXXXXXXXXX [PickupRequest] Failed to create profile:', createProfileError);
            throw new Error('Failed to create user profile');
          }
        } else if (profileCheckError) {
          console.error('XXXXXXXXXXXXXXXXXXXXXX [PickupRequest] Profile check failed:', profileCheckError);
          throw profileCheckError;
        } else {
          console.log('XXXXXXXXXXXXXXXXXXXXXX [PickupRequest] User profile exists');
        }
      } catch (profileError) {
        console.error('XXXXXXXXXXXXXXXXXXXXXX [PickupRequest] Profile validation failed:', profileError);
        throw new Error('User profile validation failed');
      }
      
      // Check if the user has enough available bags for this request
      if (availableBags < Number(values.numberOfBags)) {
        throw new Error(`You don't have enough bags available. You have ${availableBags} bag(s) available (${userStats.totalBags} total, ${requestedBags} already requested), but you're trying to request ${values.numberOfBags}.`);
      }
      
      // Validate coordinates before creating pickup
      const lat = values.location?.lat;
      const lng = values.location?.lng;
      
      console.log('[PickupRequest] 📍 Form submission - checking coordinates:', {
        lat,
        lng,
        savedLocationId: values.savedLocationId,
        fullLocation: values.location,
        formData: formData.location
      });
      
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        console.error('[PickupRequest] ❌ Invalid coordinates at submission:', { lat, lng, values });
        throw new Error('Invalid location coordinates. Please select a valid location or use the map to set your location.');
      }
      
      console.log('[PickupRequest] ✅ Using coordinates for pickup:', { lat, lng });
      console.log('[PickupRequest] 📝 Will save as POINT:', `POINT(${lng} ${lat})`);
      
      // Format the pickup data - generate UUID for id
      const pickupId = crypto.randomUUID();
      
      // Get address from selected location
      const selectedLocation = savedLocations.find(loc => loc.id === values.savedLocationId);
      const address = selectedLocation?.address || values.location?.address || '';

      // Submit using RPC function that properly handles geography type
      // This bypasses the buggy standardize_pickup_coordinates trigger
      // Fee is resolved server-side via FIFO: oldest active batch unit_price
      // bag_id is intentionally omitted — collector links it at scan time
      console.log('XXXXXXXXXXXXXXXXXXXXXX [PickupRequest] Submitting pickup via RPC');
      
      const { data, error } = await supabase
        .rpc('create_pickup_request', {
          p_id: pickupId,
          p_user_id: user.id,
          p_status: 'pending',
          p_bag_count: Number(values.numberOfBags),
          p_waste_type: values.wasteType,
          p_special_instructions: values.notes || '',
          p_longitude: lng,
          p_latitude: lat,
          p_address: address
        })
        .single();

      if (error) {
        console.error('XXXXXXXXXXXXXXXXXXXXXX [PickupRequest] Database insert failed:', error);
        throw new Error(error.message || 'Failed to create pickup request');
      }

      console.log('XXXXXXXXXXXXXXXXXXXXXX [PickupRequest] Successfully created pickup:', data.id);

      // Set points_earned in pickup_requests table only
      const PICKUP_POINTS = 5;
      try {
        console.log('[PickupRequest] Setting points for pickup request');
        
        // Update pickup_requests table with points_earned (single source of truth)
        await supabase
          .from('pickup_requests')
          .update({ points_earned: PICKUP_POINTS })
          .eq('id', data.id);
          
        console.log(`[PickupRequest] Successfully set ${PICKUP_POINTS} points for pickup request`);
        
      } catch (pointsError) {
        console.warn('[PickupRequest] Failed to set points (non-fatal):', pointsError);
        // Don't throw error - pickup was successful even if points failed
      }

      // NOTE: We do NOT update total_bags in the database
      // - total_bags reflects cumulative bags from batches and never reduces
      // - availableBags is dynamically calculated as: total_bags - requestedBags
      // - The pickup_requests subscription will automatically update requestedBags
      // - This will automatically reduce availableBags through the calculation

      // Success - show confirmation and clear form
      setSuccess(true);
      resetForm();

      // Dispatch event to update dashboard
      try {
        window.dispatchEvent(new CustomEvent('trashdrop:pickup-created', { 
          detail: { userId: user.id, pickupId: data.id } 
        }));
      } catch (_) {}
      
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
      <div className="max-w-3xl mx-auto px-2 pt-6 pb-24">
        <section className={`${card} px-5 py-6 text-center`} role="status">
          <span className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300 mb-4" aria-hidden="true">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <h1 className="text-[24px] leading-tight font-bold text-td-ink dark:text-gray-100 mb-2">Pickup Request Submitted!</h1>
          <p className="text-[15px] text-td-sage dark:text-gray-300 mb-5">
            Your request has been received. We'll notify you when the pickup is scheduled.
          </p>
          <dl className="bg-td-cream dark:bg-gray-700/60 rounded-2xl px-4 py-3 mb-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-left text-[15px]">
            <dt className="text-td-sage dark:text-gray-300">Location</dt>
            <dd className="text-td-ink dark:text-gray-100 font-semibold">{formData.savedLocationId ? savedLocations.find(loc => loc.id === formData.savedLocationId)?.name : 'Custom Location'}</dd>
            <dt className="text-td-sage dark:text-gray-300">Number of Bags</dt>
            <dd className="text-td-ink dark:text-gray-100 font-semibold">{formData.numberOfBags}</dd>
            <dt className="text-td-sage dark:text-gray-300">Priority</dt>
            <dd className="text-td-ink dark:text-gray-100 font-semibold capitalize">{formData.priority}</dd>
            <dt className="text-td-sage dark:text-gray-300">Waste Type</dt>
            <dd className="text-td-ink dark:text-gray-100 font-semibold">
              {formData.wasteType === 'general' ? 'General Waste' :
                formData.wasteType === 'recycling' ? 'Recycling' :
                formData.wasteType === 'plastic' ? 'Plastic' : 'Organic Waste'}
            </dd>
          </dl>
          <button onClick={() => navigate('/dashboard')} className={`${primaryButton} w-full`}>
            Return to Dashboard
          </button>
        </section>
      </div>
    );
  }

  const fieldClass = 'mt-1.5 block w-full h-12 px-3.5 text-[15px] bg-white dark:bg-gray-700 border border-td-border-strong dark:border-gray-500 rounded-xl text-td-ink dark:text-gray-100 focus:outline-none focus:border-td-forest focus:ring-2 focus:ring-td-forest/30 disabled:bg-td-cream disabled:text-td-sage dark:disabled:bg-gray-800';

  return (
    <div className="max-w-3xl mx-auto px-2 pb-24">
      <PageHeader
        title="Request Pickup"
        subtitle="A collector picks up your full TrashDrop bags from your door."
      />

      <div className="space-y-5 mt-4">
        {/* Bags available for pickup */}
        <section className={`${card} px-4 py-4`} aria-label="Bags available">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300 flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M6 7h12l-1 13H7L6 7z" /><path d="M9 7V5a3 3 0 016 0v2" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[15px] text-td-ink dark:text-gray-100">
                You have <span className="font-bold">{availableBags}</span> bag(s) available for pickup.
              </p>
              {requestedBags > 0 && (
                <p className="text-xs text-td-sage dark:text-gray-300 mt-0.5">
                  ({userStats.totalBags} total bags - {requestedBags} already requested = {availableBags} available)
                </p>
              )}
            </div>
          </div>

          {insufficientBags && (
            <div className={`${warningNote} px-4 py-3 mt-4`}>
              <p className="text-sm">You don't have any bags available. Please purchase bags to continue OR use the Digital Bin module.</p>
              <div className="mt-3 grid grid-cols-1 min-[480px]:grid-cols-2 gap-2.5">
                <button className={`${primaryButton} h-11 px-4 text-[15px] whitespace-nowrap`} onClick={() => setShowPurchaseModal(true)}>
                  Purchase Bags
                </button>
                <button className={`${secondaryButton} h-11 px-4 whitespace-nowrap bg-white dark:bg-gray-800`} onClick={() => navigate('/digital-bin')}>
                  Request Bin Pickup
                </button>
              </div>
            </div>
          )}
        </section>

        {error && (
          <div className={`${errorNote} px-4 py-3`} role="alert">
            <span className="block text-[15px]">{error}</span>
          </div>
        )}

        <Formik
          initialValues={formData}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          {({ values, setFieldValue, isValid, dirty, errors, touched }) => (
            <Form className="space-y-5">
              {/* Pickup Location Section */}
              <section className={`${card} px-4 py-4`} aria-labelledby="pickup-location-heading">
                <h2 id="pickup-location-heading" className={sectionTitle}>Pickup Location</h2>
                <p className="text-sm text-td-sage dark:text-gray-300 mt-1 mb-3">
                  Select your pickup location by clicking on the map or choosing from your saved locations.
                </p>

                <div className="mb-3">
                  <label htmlFor="savedLocationId" className="block text-sm font-semibold text-td-ink dark:text-gray-200">
                    Select from Saved Locations <span className="text-td-error" aria-hidden="true">*</span>
                  </label>
                  <Field
                    as="select"
                    id="savedLocationId"
                    name="savedLocationId"
                    className={fieldClass}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      setFieldValue('savedLocationId', selectedId);

                      // Find the selected location to get its coordinates
                      const selectedLocation = savedLocations.find(loc => loc.id === selectedId);

                      if (selectedLocation && selectedLocation.latitude && selectedLocation.longitude) {
                        console.log('[PickupRequest] Dropdown selected location:', selectedLocation);

                        // CRITICAL: Update Formik's location values (these are used in form submission)
                        setFieldValue('location', {
                          lat: selectedLocation.latitude,
                          lng: selectedLocation.longitude
                        });

                        // Update formData state to trigger map position update
                        setFormData(prev => ({
                          ...prev,
                          savedLocationId: selectedId,
                          location: {
                            lat: selectedLocation.latitude,
                            lng: selectedLocation.longitude
                          }
                        }));

                        console.log('[PickupRequest] ✅ Updated form location to:', {
                          lat: selectedLocation.latitude,
                          lng: selectedLocation.longitude
                        });
                      } else {
                        console.error('[PickupRequest] ❌ Selected location has no coordinates:', selectedLocation);

                        // Update formData state anyway (will trigger map update useEffect)
                        setFormData(prev => ({
                          ...prev,
                          savedLocationId: selectedId
                        }));
                      }
                    }}
                  >
                    <option value="">Choose a saved location</option>
                    {savedLocations.map(location => (
                      <option key={location.id} value={location.id}>{location.name} - {location.address}</option>
                    ))}
                  </Field>
                  {touched.savedLocationId && errors.savedLocationId && (
                    <div className="mt-1 text-sm text-td-error dark:text-red-300">{errors.savedLocationId}</div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-sm text-td-sage dark:text-gray-300">
                    <span>Select from your saved locations or</span>
                    <Link to="/profile?tab=locations" className={`${tonalButton} h-9 ml-auto`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                      Add new locations
                    </Link>
                  </div>
                </div>

                <div className="h-64 rounded-2xl overflow-hidden border border-td-border dark:border-gray-700">
                  <MapContainer
                    center={position}
                    zoom={13}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    <MapViewController position={position} />
                    <LocationMarker position={position} setPosition={handlePositionChange} />
                  </MapContainer>
                </div>
              </section>

              {/* Pickup Details Section */}
              <section className={`${card} px-4 py-4 space-y-5`} aria-labelledby="pickup-details-heading">
                <h2 id="pickup-details-heading" className={sectionTitle}>Pickup Details</h2>

                {/* Number of Bags - Dynamic based on available bags */}
                <div>
                  <label htmlFor="numberOfBags" className="block text-sm font-semibold text-td-ink dark:text-gray-200">
                    Number of Bags <span className="text-td-error" aria-hidden="true">*</span>
                    {availableBags > 0 && (
                      <span className="ml-2 text-xs font-normal text-td-sage dark:text-gray-300">
                        (You have {availableBags} bag{availableBags !== 1 ? 's' : ''} available)
                      </span>
                    )}
                  </label>
                  <Field
                    as="select"
                    id="numberOfBags"
                    name="numberOfBags"
                    className={fieldClass}
                    disabled={availableBags <= 0}
                  >
                    {/* Dynamically generate options based on available bags, up to 10 maximum */}
                    {[...Array(Math.min(availableBags, 10))].map((_, index) => {
                      const bagNumber = index + 1;
                      return (
                        <option key={bagNumber} value={String(bagNumber)}>
                          {bagNumber} Bag{bagNumber !== 1 ? 's' : ''}
                        </option>
                      );
                    })}
                    {availableBags <= 0 && (
                      <option value="1">No bags available</option>
                    )}
                  </Field>
                  {touched.numberOfBags && errors.numberOfBags && (
                    <div className="mt-1 text-sm text-td-error dark:text-red-300">{errors.numberOfBags}</div>
                  )}
                </div>

                {/* Priority */}
                <div role="group" aria-labelledby="pickup-priority-label">
                  <p id="pickup-priority-label" className="text-sm font-semibold text-td-ink dark:text-gray-200 mb-2">
                    Priority <span className="text-td-error" aria-hidden="true">*</span>
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {PRIORITY_OPTIONS.map((option) => (
                      <OptionTile
                        key={option.value}
                        selected={values.priority === option.value}
                        onClick={() => setFieldValue('priority', option.value)}
                        icon={option.icon}
                        label={option.label}
                        hint={option.description}
                      />
                    ))}
                  </div>
                  {touched.priority && errors.priority && (
                    <div className="mt-1 text-sm text-td-error dark:text-red-300">{errors.priority}</div>
                  )}
                </div>

                {/* Waste Type */}
                <div role="group" aria-labelledby="pickup-waste-label">
                  <p id="pickup-waste-label" className="text-sm font-semibold text-td-ink dark:text-gray-200 mb-2">
                    Waste Type <span className="text-td-error" aria-hidden="true">*</span>
                  </p>
                  <div className="grid grid-cols-2 min-[480px]:grid-cols-4 gap-2">
                    {WASTE_OPTIONS.map((option) => (
                      <OptionTile
                        key={option.value}
                        selected={values.wasteType === option.value}
                        onClick={() => setFieldValue('wasteType', option.value)}
                        icon={option.icon}
                        label={option.label}
                        hint={option.description}
                      />
                    ))}
                  </div>
                  {touched.wasteType && errors.wasteType && (
                    <div className="mt-1 text-sm text-td-error dark:text-red-300">{errors.wasteType}</div>
                  )}
                  <div className={`${infoNote} mt-3 px-3.5 py-2.5 flex items-start gap-2 text-sm`}>
                    <svg className="flex-shrink-0 h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
                    </svg>
                    <p>Earn reward points by properly segregating recycling and plastic waste!</p>
                  </div>
                </div>

                {/* Additional Notes */}
                <div>
                  <label htmlFor="notes" className="block text-sm font-semibold text-td-ink dark:text-gray-200">
                    Additional Notes (Optional)
                  </label>
                  <Field
                    as="textarea"
                    id="notes"
                    name="notes"
                    rows={3}
                    className="mt-1.5 block w-full px-3.5 py-2.5 text-[15px] bg-white dark:bg-gray-700 border border-td-border-strong dark:border-gray-500 rounded-xl text-td-ink dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:border-td-forest focus:ring-2 focus:ring-td-forest/30"
                    placeholder="Any other information for the collector"
                  />
                  {touched.notes && errors.notes && (
                    <div className="mt-1 text-sm text-td-error dark:text-red-300">{errors.notes}</div>
                  )}
                </div>
              </section>

              {/* Pricing & Rewards Section */}
              <section className={`${card} px-4 py-4`} aria-labelledby="pickup-pricing-heading">
                <h2 id="pickup-pricing-heading" className={sectionTitle}>Pricing & Rewards</h2>
                <p className="text-[15px] text-td-sage dark:text-gray-300 mt-1">No standard pickup fee</p>
              </section>

              {userStats.totalBags <= 0 && (
                <div className={`${warningNote} px-4 py-3 text-sm`} role="alert">
                  No bags available. Scan a batch to enable pickup.
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                className={`${primaryButton} w-full h-[52px]`}
                disabled={submitDisabled}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center">
                    <LoadingSpinner size="sm" />
                    <span className="ml-2">Processing...</span>
                  </span>
                ) : (
                  'Request Pickup'
                )}
              </button>
            </Form>
          )}
        </Formik>
      </div>

      {/* Purchase Bags — Coming Soon Modal */}
      {showPurchaseModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowPurchaseModal(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          
          {/* Modal content */}
          <div 
            className="relative w-full max-w-md mx-auto bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setShowPurchaseModal(false)}
              className="absolute top-3 right-3 p-1.5 rounded-full text-td-sage hover:text-td-ink hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors z-10"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="px-6 pt-6 pb-3 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-td-tonal dark:bg-green-900/40 mb-3">
                <svg className="w-7 h-7 text-td-forest dark:text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-td-ink dark:text-white">Purchase Bags</h3>
              <span className="inline-block mt-1 px-3 py-0.5 text-xs font-semibold text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40 rounded-full">
                Coming Soon
              </span>
            </div>

            {/* Body */}
            <div className="px-6 pb-2">
              <p className="text-sm text-td-sage dark:text-gray-300 text-center mb-4">
                In-app bag purchasing is currently being developed. Soon you'll be able to buy TrashDrop QR-coded bags directly from the app!
              </p>

              {/* Pricing card */}
              <div className="bg-td-cream dark:bg-gray-700/50 rounded-xl p-4 mb-4">
                <h4 className="text-sm font-semibold text-td-ink dark:text-gray-200 mb-3 flex items-center">
                  <svg className="w-4 h-4 mr-1.5 text-green-700" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                  Bag Pricing — Per Batch of 5 Bags
                </h4>
                <p className="text-xs text-td-sage dark:text-gray-400 mb-2">
                  Pricing varies by location. Visit our website for the latest rates in your area.
                </p>
                <a
                  href="https://trashdrops.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm font-semibold text-td-forest dark:text-green-300 hover:underline"
                >
                  View pricing on trashdrops.com
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>

              {/* How to get bags now */}
              <div className={`${infoNote} p-4 mb-4`}>
                <h4 className="text-sm font-bold mb-2">How to get bags now</h4>
                <ul className="text-sm space-y-1.5">
                  <li className="flex items-start">
                    <span className="font-bold mr-1.5 mt-px">1.</span>
                    <span>Purchase a batch from an authorized TrashDrop vendor</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-bold mr-1.5 mt-px">2.</span>
                    <span>Scan the batch QR code using the <strong>Scan QR</strong> tab</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-bold mr-1.5 mt-px">3.</span>
                    <span>Your bags will be credited to your account instantly</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 flex flex-col gap-2">
              <button
                className={`${primaryButton} w-full`}
                onClick={() => {
                  setShowPurchaseModal(false);
                  navigate('/qr-scanner');
                }}
              >
                Scan a Batch QR Code
              </button>
              <button
                className={`${secondaryButton} w-full`}
                onClick={() => setShowPurchaseModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PickupRequest;
