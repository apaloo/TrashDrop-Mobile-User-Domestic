import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import appConfig from '../utils/app-config';

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
  const [userStats, setUserStats] = useState({
    totalBags: 0,
    batches: 0
  });
  const [insufficientBags, setInsufficientBags] = useState(false);
  
  // Load saved locations from Supabase when component mounts
  useEffect(() => {
    const loadSavedLocations = async () => {
      if (!user) return;
      
      // Clear any existing saved locations first
      setSavedLocations([]);
      
      try {
        // Clear localStorage to completely remove any potential hardcoded/mock locations
        localStorage.removeItem('trashdrop_locations');
        
        // Make sure we start with an empty array
        setSavedLocations([]);
        
        // Fetch only locations specifically added by the user in Profile & Settings
        const { data, error } = await supabase
          .from('saved_locations')
          .select('*')
          .eq('user_id', user.id)
          .eq('source', 'user_profile') // Only fetch locations added via Profile & Settings
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          // Format locations to match component's expected structure
          const formattedLocations = data.map(location => ({
            id: location.id,
            name: location.name,
            address: location.address,
          }));
          
          console.log('Loaded saved locations from profile:', formattedLocations);
          setSavedLocations(formattedLocations);
          
          // Only save to localStorage if we have actual locations from Supabase
          if (formattedLocations && formattedLocations.length > 0) {
            localStorage.setItem('trashdrop_locations', JSON.stringify(formattedLocations));
          } else {
            // Ensure we remove any old data
            localStorage.removeItem('trashdrop_locations');
          }
        } else {
          console.log('No saved locations found for user in Profile & Settings');
        }
      } catch (error) {
        console.error('Error loading saved locations:', error);
      }
    };
    
    loadSavedLocations();
    
    // Setup real-time subscription for saved locations
    const subscription = supabase
      .channel('saved_locations_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'saved_locations', filter: `user_id=eq.${user?.id}` },
        () => {
          loadSavedLocations();
        }
      )
      .subscribe();
    
    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
    
    // Add event listener to refresh locations when localStorage changes
    // This helps synchronize data between tabs/windows
    const handleStorageChange = (e) => {
      if (e.key === 'trashdrop_locations') {
        loadSavedLocations();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

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
            .single();
            
          if (statsError) throw statsError;
          
          if (statsData) {
            setUserStats({
              totalBags: statsData.total_bags || 0,
              batches: statsData.total_batches || 0
            });
            
            // Check if the user has enough bags
            if (statsData.total_bags <= 0) {
              setInsufficientBags(true);
            }
          }
        } catch (error) {
          console.error('Error fetching user stats:', error);
        }
      }
    };
    
    fetchUserStats();
  }, [user]);

  // Schema for form validation
  const validationSchema = Yup.object().shape({
    savedLocationId: Yup.string(),
    numberOfBags: Yup.number()
      .typeError('Please enter a valid number')
      .min(1, 'Minimum 1 bag required')
      .max(10, 'Maximum 10 bags allowed')
      .max(userStats.totalBags, `You only have ${userStats.totalBags} bag(s) available`)
      .required('Number of bags is required'),
    priority: Yup.string().required('Priority is required'),
    wasteType: Yup.string().required('Waste type is required'),
    notes: Yup.string().max(300, 'Notes cannot exceed 300 characters'),
    location: Yup.object().shape({
      lat: Yup.number().required('Latitude is required'),
      lng: Yup.number().required('Longitude is required'),
    }),
  });

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
      
      // Add to pickups table in Supabase
      const { data, error } = await supabase
        .from('pickups')
        .insert([pickupData]);
        
      if (error) throw error;
      
      // Update the user's bag count in the stats table
      const { error: statsError } = await supabase.rpc('decrement_user_bags', {
        user_id_param: user.id,
        bags_to_remove: Number(values.numberOfBags)
      });
      
      if (statsError) {
        console.error('Error updating bag count:', statsError);
        // Continue with success even if the stats update fails - this should be handled by a background job
      } else {
        // Update the local state to reflect the new bag count
        setUserStats(prev => ({
          ...prev,
          totalBags: prev.totalBags - Number(values.numberOfBags)
        }));
      }
      
      // Success - show confirmation and clear form
      setSuccess(true);
      resetForm();
      
      // Automatically redirect after 3 seconds
      setTimeout(() => {
        navigate('/');
      }, 3000);
    } catch (error) {
      console.error('Error submitting pickup request:', error);
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
    <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden mb-20 md:mb-0">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">
          Request Pickup
        </h1>
        
        {/* Display bag availability information */}
        <div className="mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            You have <span className="font-bold">{userStats.totalBags}</span> bag(s) available for pickup.
          </p>
        </div>
        
        {insufficientBags && (
          <div className="bg-yellow-100 dark:bg-yellow-900 p-4 rounded-md text-yellow-700 dark:text-yellow-200 mb-4">
            <p>No bags available in your account. Please topup your bags now or use the Schedule Pickup option.</p>
            <div className="mt-3">
              <button 
                className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors"
                onClick={() => navigate('/schedule-pickup')}
              >
                Go to Schedule Pickup
              </button>
            </div>
          </div>
        )}
        
        {success ? (
          <div className="bg-green-100 dark:bg-green-900 p-4 rounded-md text-green-700 dark:text-green-200 mb-4">
            <p>Your pickup request has been submitted successfully! A collector will be assigned shortly.</p>
            <p className="mt-2">Redirecting to dashboard...</p>
          </div>
        ) : insufficientBags ? null : (
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
        )}
        
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
                      <option value="">-- Select a saved location --</option>
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
                  
                  {/* Number of Bags */}
                  <div className="mb-4">
                    <label htmlFor="numberOfBags" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Number of Bags <span className="text-red-600">*</span>
                    </label>
                    <Field
                      as="select"
                      id="numberOfBags"
                      name="numberOfBags"
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white rounded-md"
                    >
                      <option value="1">1 Bag</option>
                      <option value="2">2 Bags</option>
                      <option value="3">3 Bags</option>
                      <option value="4">4 Bags</option>
                      <option value="5">5 Bags</option>
                    </Field>
                    {touched.numberOfBags && errors.numberOfBags && (
                      <div className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.numberOfBags}</div>
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
                      <option value="normal">Normal</option>
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
              {/* Submit button */}
              <button
                type="submit"
                className="w-full px-6 py-3 bg-green-600 text-white font-medium text-lg rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                disabled={isSubmitting}
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
