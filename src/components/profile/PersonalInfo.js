import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';

/**
 * Personal Information tab component for the Profile page
 * Allows users to view and update their personal information
 */
const PersonalInfo = () => {
  const { user } = useAuth();
  
  // Sample user data - in a real app, this would come from a context or API
  const [userData, setUserData] = useState({
    firstName: '',
    lastName: '',
    email: user?.email || 'user@example.com',
    phone: '',
    address: '',
    profileImage: null,
    memberSince: 'Jan 2025'
  });

  // Load profile data from localStorage on component mount
  useEffect(() => {
    const userId = user?.id || 'guest';
    const storedProfile = localStorage.getItem(`profile_${userId}`);
    
    if (storedProfile) {
      try {
        const parsedProfile = JSON.parse(storedProfile);
        setUserData(prevData => ({ ...prevData, ...parsedProfile }));
      } catch (error) {
        console.error('Error parsing stored profile:', error);
      }
    }
  }, [user]);

  // State to track form changes
  const [formData, setFormData] = useState({ ...userData });

  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  // Handle profile image upload
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newProfileImage = reader.result;
        
        // Update form data with new image
        setFormData({
          ...formData,
          profileImage: newProfileImage
        });
        
        // Save image to localStorage immediately for persistence
        const userId = user?.id || 'guest';
        const storedProfile = localStorage.getItem(`profile_${userId}`);
        let profileData = {};
        
        try {
          if (storedProfile) {
            profileData = JSON.parse(storedProfile);
          }
        } catch (error) {
          console.error('Error parsing stored profile:', error);
        }
        
        // Update profile with new image
        profileData.profileImage = newProfileImage;
        localStorage.setItem(`profile_${userId}`, JSON.stringify(profileData));
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    // In a real app, this would make an API call to update the user data
    setUserData({ ...formData });
    
    // Save all form data to localStorage for persistence
    const userId = user?.id || 'guest';
    localStorage.setItem(`profile_${userId}`, JSON.stringify(formData));
    
    alert('Personal information updated!');
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
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
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PersonalInfo;
