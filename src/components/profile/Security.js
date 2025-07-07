import React, { useState } from 'react';

/**
 * Security tab component for the Profile page
 * Allows users to manage password and active login sessions
 */
const Security = () => {
  // State for password form
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  // State for password strength
  const [passwordStrength, setPasswordStrength] = useState('');

  // Current device info (would come from context/API in a real app)
  const deviceInfo = {
    device: 'Chrome on macOS',
    status: 'Active now'
  };

  // Handle password input changes
  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm({
      ...passwordForm,
      [name]: value
    });

    // Check password strength if the newPassword field is being updated
    if (name === 'newPassword') {
      calculatePasswordStrength(value);
    }
  };

  // Calculate password strength
  const calculatePasswordStrength = (password) => {
    if (!password) {
      setPasswordStrength('');
      return;
    }

    let strength = 0;
    
    // Check password length
    if (password.length >= 8) strength += 1;
    if (password.length >= 12) strength += 1;
    
    // Check for mixed case
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength += 1;
    
    // Check for numbers
    if (password.match(/\d/)) strength += 1;
    
    // Check for special characters
    if (password.match(/[^a-zA-Z\d]/)) strength += 1;

    // Determine strength level
    if (strength <= 2) {
      setPasswordStrength('Too weak');
    } else if (strength === 3) {
      setPasswordStrength('Medium');
    } else if (strength === 4) {
      setPasswordStrength('Strong');
    } else {
      setPasswordStrength('Very strong');
    }
  };

  // Get strength color based on password strength
  const getStrengthColor = () => {
    switch (passwordStrength) {
      case 'Too weak':
        return 'text-red-500';
      case 'Medium':
        return 'text-yellow-500';
      case 'Strong':
        return 'text-green-500';
      case 'Very strong':
        return 'text-green-600';
      default:
        return 'text-gray-500';
    }
  };

  // Handle password update
  const handlePasswordUpdate = (e) => {
    e.preventDefault();
    
    if (!passwordForm.currentPassword) {
      alert('Please enter your current password.');
      return;
    }
    
    if (!passwordForm.newPassword) {
      alert('Please enter a new password.');
      return;
    }
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert('New password and confirmation do not match.');
      return;
    }
    
    if (passwordStrength === 'Too weak') {
      alert('Please choose a stronger password.');
      return;
    }

    // In a real app, this would make an API call to update the password
    alert('Password updated successfully!');
    
    // Reset form
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
    setPasswordStrength('');
  };

  // Handle logout from all devices
  const handleLogoutAllDevices = () => {
    // In a real app, this would make an API call to invalidate all sessions
    alert('Logged out from all devices successfully!');
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      {/* Change Password Section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Change Password</h2>
        
        <form onSubmit={handlePasswordUpdate}>
          {/* Current Password */}
          <div className="mb-4">
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Current Password
            </label>
            <input
              type="password"
              id="currentPassword"
              name="currentPassword"
              value={passwordForm.currentPassword}
              onChange={handlePasswordChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* New Password */}
          <div className="mb-2">
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              New Password
            </label>
            <input
              type="password"
              id="newPassword"
              name="newPassword"
              value={passwordForm.newPassword}
              onChange={handlePasswordChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* Password Strength Indicator */}
          {passwordForm.newPassword && (
            <div className="mb-4">
              <p className={`text-sm ${getStrengthColor()}`}>
                Password strength: {passwordStrength}
              </p>
            </div>
          )}
          
          {/* Confirm New Password */}
          <div className="mb-6">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={passwordForm.confirmPassword}
              onChange={handlePasswordChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* Update Password Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Update Password
            </button>
          </div>
        </form>
      </section>

      {/* Divider */}
      <hr className="my-8 border-gray-200 dark:border-gray-700" />

      {/* Login Sessions Section */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Login Sessions</h2>
        
        {/* Current Device */}
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-2">Current Device</h3>
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <p className="text-gray-800 dark:text-gray-200">{deviceInfo.device} • {deviceInfo.status}</p>
          </div>
        </div>
        
        {/* Logout Button */}
        <div className="flex justify-end">
          <button
            onClick={handleLogoutAllDevices}
            className="px-4 py-2 border border-red-500 text-red-500 rounded-md hover:bg-red-50 flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout from All Devices
          </button>
        </div>
      </section>
    </div>
  );
};

export default Security;
