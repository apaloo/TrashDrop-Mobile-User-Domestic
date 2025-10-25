import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import supabase from '../../utils/supabaseClient.js';

/**
 * Security tab component for the Profile page
 * Allows users to manage password and active login sessions
 */
const Security = () => {
  const { user, signOut } = useAuth();
  
  // State for password form
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  // State for password strength
  const [passwordStrength, setPasswordStrength] = useState('');
  
  // UI state
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  
  // Device/session info
  const [deviceInfo, setDeviceInfo] = useState({
    device: 'Loading...',
    status: 'Checking...'
  });
  
  // Get device information on mount
  useEffect(() => {
    const getDeviceInfo = () => {
      const userAgent = navigator.userAgent;
      let browser = 'Unknown Browser';
      let os = 'Unknown OS';
      
      // Detect browser
      if (userAgent.indexOf('Chrome') > -1 && userAgent.indexOf('Edg') === -1) {
        browser = 'Chrome';
      } else if (userAgent.indexOf('Safari') > -1 && userAgent.indexOf('Chrome') === -1) {
        browser = 'Safari';
      } else if (userAgent.indexOf('Firefox') > -1) {
        browser = 'Firefox';
      } else if (userAgent.indexOf('Edg') > -1) {
        browser = 'Edge';
      }
      
      // Detect OS
      if (userAgent.indexOf('Win') > -1) {
        os = 'Windows';
      } else if (userAgent.indexOf('Mac') > -1) {
        os = 'macOS';
      } else if (userAgent.indexOf('Linux') > -1) {
        os = 'Linux';
      } else if (userAgent.indexOf('Android') > -1) {
        os = 'Android';
      } else if (userAgent.indexOf('iOS') > -1 || userAgent.indexOf('iPhone') > -1) {
        os = 'iOS';
      }
      
      setDeviceInfo({
        device: `${browser} on ${os}`,
        status: 'Active now'
      });
    };
    
    getDeviceInfo();
  }, []);

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
  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!passwordForm.currentPassword) {
      setSaveMessage({ type: 'error', text: 'Please enter your current password.' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }
    
    if (!passwordForm.newPassword) {
      setSaveMessage({ type: 'error', text: 'Please enter a new password.' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setSaveMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }
    
    if (passwordStrength === 'Too weak') {
      setSaveMessage({ type: 'error', text: 'Please choose a stronger password.' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    try {
      setIsUpdating(true);
      console.log('[Security] Updating password for user:', user?.id);
      
      // Update password using Supabase Auth
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword
      });
      
      if (error) {
        console.error('[Security] Error updating password:', error);
        throw error;
      }
      
      console.log('[Security] Password updated successfully');
      setSaveMessage({ type: 'success', text: 'Password updated successfully!' });
      
      // Reset form
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setPasswordStrength('');
      
      setTimeout(() => setSaveMessage(null), 3000);
      
    } catch (error) {
      console.error('[Security] Error in handlePasswordUpdate:', error);
      setSaveMessage({ 
        type: 'error', 
        text: error.message || 'Failed to update password. Please try again.' 
      });
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle logout from all devices
  const handleLogoutAllDevices = async () => {
    if (!window.confirm('Are you sure you want to logout from all devices? You will need to log in again.')) {
      return;
    }
    
    try {
      setIsLoggingOut(true);
      console.log('[Security] Logging out from all devices');
      
      // Sign out using Supabase Auth (this invalidates all sessions)
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('[Security] Error logging out:', error);
        throw error;
      }
      
      // Clear all local storage
      localStorage.clear();
      sessionStorage.clear();
      
      console.log('[Security] Logged out successfully');
      
      // The signOut from AuthContext will handle the redirect
      if (signOut) {
        await signOut();
      }
      
    } catch (error) {
      console.error('[Security] Error in handleLogoutAllDevices:', error);
      setSaveMessage({ 
        type: 'error', 
        text: error.message || 'Failed to logout. Please try again.' 
      });
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setIsLoggingOut(false);
    }
  };

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
              disabled={isUpdating}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isUpdating ? (
                <>
                  <svg className="animate-spin h-5 w-5 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Updating...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Update Password
                </>
              )}
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
            disabled={isLoggingOut}
            className="px-4 py-2 border border-red-500 text-red-500 rounded-md hover:bg-red-50 flex items-center disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 disabled:border-gray-300"
          >
            {isLoggingOut ? (
              <>
                <svg className="animate-spin h-5 w-5 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Logging out...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout from All Devices
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
};

export default Security;
