import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { userService } from '../../services/userService.js';
import supabase from '../../utils/supabaseClient.js';

/**
 * Personal Information tab component for the Profile page
 * Allows users to view and update their personal information
 */
const PersonalInfo = () => {
  const { user } = useAuth();
  
  // User data state
  const [userData, setUserData] = useState({
    firstName: '',
    lastName: '',
    email: user?.email || '',
    phone: '',
    address: '',
    profileImage: null,
    memberSince: ''
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  // State to track form changes (initialized with same initial values as userData)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: user?.email || '',
    phone: '',
    address: '',
    profileImage: null,
    memberSince: ''
  });

  // Load profile data from Supabase on component mount
  useEffect(() => {
    const loadProfileData = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }
      
      try {
        setIsLoading(true);
        console.log('[PersonalInfo] Loading profile for user:', user.id);
        
        // Fetch user profile from Supabase
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('id, email, first_name, last_name, phone, address, avatar_url, created_at')
          .eq('id', user.id)
          .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
          console.error('[PersonalInfo] Error loading profile:', error);
          throw error;
        }
        
        if (profileData) {
          // Calculate member since date from created_at
          const memberSince = profileData.created_at 
            ? new Date(profileData.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : 'Recently';
          
          const loadedData = {
            firstName: profileData.first_name || '',
            lastName: profileData.last_name || '',
            email: profileData.email || user.email || '',
            phone: profileData.phone || '',
            address: profileData.address || '',
            profileImage: profileData.avatar_url || null,
            memberSince: memberSince
          };
          
          setUserData(loadedData);
          setFormData(loadedData);
          
          // Also cache in localStorage for offline access
          localStorage.setItem(`profile_${user.id}`, JSON.stringify(loadedData));
          console.log('[PersonalInfo] Profile loaded successfully');
        } else {
          // No profile found - this is a new user
          console.log('[PersonalInfo] No profile found, will create on first save');
          
          // Try localStorage as fallback
          const storedProfile = localStorage.getItem(`profile_${user.id}`);
          if (storedProfile) {
            try {
              const parsedProfile = JSON.parse(storedProfile);
              const fallbackData = { ...userData, ...parsedProfile, email: user.email };
              setUserData(fallbackData);
              setFormData(fallbackData);
              console.log('[PersonalInfo] Loaded from localStorage');
            } catch (err) {
              console.error('[PersonalInfo] Error parsing cached profile:', err);
            }
          } else {
            // Set default data for new user
            const defaultData = {
              firstName: '',
              lastName: '',
              email: user.email || '',
              phone: '',
              address: '',
              profileImage: null,
              memberSince: 'Recently'
            };
            setUserData(defaultData);
            setFormData(defaultData);
            console.log('[PersonalInfo] Initialized with default data');
          }
        }
      } catch (error) {
        console.error('[PersonalInfo] Error in loadProfileData:', error);
        setSaveMessage({ type: 'error', text: 'Failed to load profile data' });
        setTimeout(() => setSaveMessage(null), 3000);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadProfileData();
  }, [user]);

  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  // Handle profile image upload
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setSaveMessage({ type: 'error', text: 'Image must be less than 2MB' });
        setTimeout(() => setSaveMessage(null), 3000);
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const newProfileImage = reader.result;
        
        // Update form data with new image
        setFormData({
          ...formData,
          profileImage: newProfileImage
        });
        
        // Note: Image will be saved to database when user clicks Save Changes
        setSaveMessage({ type: 'info', text: 'Click "Save Changes" to upload your profile picture' });
        setTimeout(() => setSaveMessage(null), 3000);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!user?.id) {
      setSaveMessage({ type: 'error', text: 'You must be logged in to update your profile' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }
    
    try {
      setIsSaving(true);
      console.log('[PersonalInfo] Saving profile for user:', user.id);
      
      // Prepare data for database update
      const updateData = {
        email: formData.email,
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone: formData.phone,
        address: formData.address,
        avatar_url: formData.profileImage
      };
      
      // Update profile in Supabase
      const { data, error } = await userService.updateUserProfile(user.id, updateData);
      
      if (error) {
        console.error('[PersonalInfo] Error updating profile:', error);
        throw new Error(error.message || 'Failed to update profile');
      }
      
      // Update local state
      setUserData({ ...formData });
      
      // Update localStorage cache
      localStorage.setItem(`profile_${user.id}`, JSON.stringify(formData));
      
      console.log('[PersonalInfo] Profile updated successfully');
      setSaveMessage({ type: 'success', text: 'Personal information updated successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
      
    } catch (error) {
      console.error('[PersonalInfo] Error in handleSubmit:', error);
      setSaveMessage({ type: 'error', text: error.message || 'Failed to update profile. Please try again.' });
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading profile...</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      {/* Save status message */}
      {saveMessage && (
        <div className={`mb-4 p-3 rounded-md ${
          saveMessage.type === 'success' ? 'bg-green-100 text-green-700' :
          saveMessage.type === 'error' ? 'bg-red-100 text-red-700' :
          'bg-blue-100 text-blue-700'
        }`}>
          {saveMessage.text}
        </div>
      )}
      <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
        {/* Profile Picture Section */}
        <div className="flex flex-col items-center">
          <div className="relative">
            <div className="h-32 w-32 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
              {formData.profileImage ? (
                <img 
                  src={formData.profileImage} 
                  alt="Profile" 
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-gray-400 text-4xl">👤</span>
              )}
            </div>
            <label 
              htmlFor="profile-upload" 
              className="absolute bottom-0 right-0 bg-blue-500 text-white p-2 rounded-full cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </label>
            <input 
              id="profile-upload" 
              type="file" 
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
          <h3 className="text-lg font-medium mt-4">{user?.email ? user.email.split('@')[0] : 'User Name'}</h3>
          <p className="text-sm text-gray-500">Member since: {userData.memberSince}</p>
        </div>

        {/* Personal Information Form */}
        <div className="flex-grow w-full">
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* First Name */}
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Last Name */}
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Email Address */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                />
                <p className="text-xs text-gray-500 mt-1">Email address cannot be changed</p>
              </div>

              {/* Phone Number */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Address */}
            <div className="mt-4">
              <label htmlFor="address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Address
              </label>
              <input
                type="text"
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Save Button */}
            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin h-5 w-5 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PersonalInfo;
