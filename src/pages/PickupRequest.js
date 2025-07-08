import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../context/AuthContext';
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
  
  // Load saved locations from localStorage when component mounts
  useEffect(() => {
    const loadSavedLocations = () => {
      try {
        const savedLocationsJson = localStorage.getItem('trashdrop_locations');
        if (savedLocationsJson) {
          const userSavedLocations = JSON.parse(savedLocationsJson);
          setSavedLocations(userSavedLocations);
        }
      } catch (error) {
        console.error('Error loading saved locations:', error);
      }
    };
    
    loadSavedLocations();
    
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

  // Schema for form validation
  const validationSchema = Yup.object().shape({
    savedLocationId: Yup.string().required('Please select a saved location'),
    numberOfBags: Yup.string().required('Please select number of bags'),
    priority: Yup.string().required('Please select priority'),
    wasteType: Yup.string().required('Please select waste type'),
    notes: Yup.string().max(200, 'Notes must be less than 200 characters'),
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
  const handleSubmit = async (values) => {
    setIsSubmitting(true);
    setError('');
    
    try {
      // Get location details if using saved location
      let locationDetails = {};
      if (values.savedLocationId) {
        const selectedLocation = savedLocations.find(loc => loc.id === values.savedLocationId);
        if (selectedLocation) {
          locationDetails = {
            address: selectedLocation.address,
            name: selectedLocation.name,
          };
        }
      }
      
      // In a real app, this would be an API call
      console.log('Submitting pickup request:', {
        ...values,
        ...locationDetails,
        userId: user?.id,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Show success message
      setSuccess(true);
      
      // Navigate to dashboard after 3 seconds
      setTimeout(() => {
        navigate('/dashboard');
      }, 3000);
    } catch (err) {
      console.error('Error submitting pickup request:', err);
      setError('Failed to submit pickup request. Please try again later.');
    } finally {
      setIsSubmitting(false);
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
        
        <div className="mb-6">
          <span className="flex items-center text-red-600 dark:text-red-400 text-sm mb-2">
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
            </svg>
            Fields marked with * are required
          </span>
        </div>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center text-blue-600">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
            </svg>
            Request a one-time pickup for your trash
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
