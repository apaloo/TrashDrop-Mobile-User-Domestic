import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import supabase from '../../utils/supabaseClient.js';

/**
 * Notifications tab component for the Profile page
 * Allows users to configure push and email notification preferences
 */
const Notifications = () => {
  const { user } = useAuth();
  
  // State for notification settings
  const [notificationSettings, setNotificationSettings] = useState({
    pushEnabled: true,
    emailEnabled: true,
    pushNotifications: {
      pickupReminders: true,
      bagScans: true,
      pointsEarned: true,
      newsUpdates: true
    },
    emailNotifications: {
      weeklyPickupSummary: true,
      monthlyPointsSummary: true,
      specialOffers: false
    }
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  // Load notification preferences from database on mount
  useEffect(() => {
    const loadNotificationPreferences = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }
      
      try {
        setIsLoading(true);
        console.log('[Notifications] Loading notification preferences for user:', user.id);
        
        // Fetch user notification preferences from Supabase profiles table
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('notification_preferences')
          .eq('id', user.id)
          .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
          console.error('[Notifications] Error loading preferences:', error);
          throw error;
        }
        
        if (profileData && profileData.notification_preferences) {
          const prefs = profileData.notification_preferences;
          
          // Extract notification settings
          const loadedSettings = {
            pushEnabled: prefs.pushEnabled !== undefined ? prefs.pushEnabled : true,
            emailEnabled: prefs.emailEnabled !== undefined ? prefs.emailEnabled : true,
            pushNotifications: {
              pickupReminders: prefs.pushNotifications?.pickupReminders !== undefined ? prefs.pushNotifications.pickupReminders : true,
              bagScans: prefs.pushNotifications?.bagScans !== undefined ? prefs.pushNotifications.bagScans : true,
              pointsEarned: prefs.pushNotifications?.pointsEarned !== undefined ? prefs.pushNotifications.pointsEarned : true,
              newsUpdates: prefs.pushNotifications?.newsUpdates !== undefined ? prefs.pushNotifications.newsUpdates : true
            },
            emailNotifications: {
              weeklyPickupSummary: prefs.emailNotifications?.weeklyPickupSummary !== undefined ? prefs.emailNotifications.weeklyPickupSummary : true,
              monthlyPointsSummary: prefs.emailNotifications?.monthlyPointsSummary !== undefined ? prefs.emailNotifications.monthlyPointsSummary : true,
              specialOffers: prefs.emailNotifications?.specialOffers !== undefined ? prefs.emailNotifications.specialOffers : false
            }
          };
          
          setNotificationSettings(loadedSettings);
          console.log('[Notifications] Notification preferences loaded successfully:', loadedSettings);
        }
      } catch (error) {
        console.error('[Notifications] Error in loadNotificationPreferences:', error);
        setSaveMessage({ type: 'error', text: 'Failed to load notification preferences' });
        setTimeout(() => setSaveMessage(null), 3000);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadNotificationPreferences();
  }, [user]);
  
  // Handle master toggle changes
  const handleMasterToggle = (type) => {
    if (type === 'push') {
      setNotificationSettings({
        ...notificationSettings,
        pushEnabled: !notificationSettings.pushEnabled
      });
    } else if (type === 'email') {
      setNotificationSettings({
        ...notificationSettings,
        emailEnabled: !notificationSettings.emailEnabled
      });
    }
  };

  // Handle individual push notification toggles
  const handlePushToggle = (name) => {
    setNotificationSettings({
      ...notificationSettings,
      pushNotifications: {
        ...notificationSettings.pushNotifications,
        [name]: !notificationSettings.pushNotifications[name]
      }
    });
  };

  // Handle individual email notification toggles
  const handleEmailToggle = (name) => {
    setNotificationSettings({
      ...notificationSettings,
      emailNotifications: {
        ...notificationSettings.emailNotifications,
        [name]: !notificationSettings.emailNotifications[name]
      }
    });
  };

  // Handle form submission
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    
    if (!user?.id) {
      setSaveMessage({ type: 'error', text: 'You must be logged in to save notification settings' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }
    
    try {
      setIsSaving(true);
      console.log('[Notifications] Saving notification preferences for user:', user.id);
      
      // Update notification preferences in Supabase
      const { error } = await supabase
        .from('profiles')
        .update({
          notification_preferences: notificationSettings,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
      
      if (error) {
        console.error('[Notifications] Error saving preferences:', error);
        throw error;
      }
      
      console.log('[Notifications] Notification preferences saved successfully');
      setSaveMessage({ type: 'success', text: 'Notification settings saved successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
      
    } catch (error) {
      console.error('[Notifications] Error in handleSaveSettings:', error);
      setSaveMessage({ type: 'error', text: 'Failed to save notification settings. Please try again.' });
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle switch component
  const ToggleSwitch = ({ checked, onChange }) => (
    <div className="relative inline-block w-12 mr-2 align-middle select-none">
      <input 
        type="checkbox" 
        checked={checked}
        onChange={onChange}
        className="absolute block w-6 h-6 bg-white border-4 rounded-full appearance-none cursor-pointer"
        style={{
          top: '0.25rem',
          left: checked ? '6px' : '0px',
          transition: 'left 0.2s ease-in-out',
          backgroundColor: checked ? '#4299e1' : '#fff',
          borderColor: checked ? '#4299e1' : '#d1d5db'
        }}
      />
      <label 
        className={`block overflow-hidden h-6 rounded-full cursor-pointer ${
          checked ? 'bg-blue-300' : 'bg-gray-300'
        }`}
      ></label>
    </div>
  );

  // Checkbox component
  const Checkbox = ({ id, checked, onChange, label }) => (
    <div className="flex items-center mb-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
      />
      <label htmlFor={id} className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
    </div>
  );

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading notification settings...</span>
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
      <form onSubmit={handleSaveSettings}>
        {/* Push Notifications Section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Push Notifications</h2>
            <ToggleSwitch 
              checked={notificationSettings.pushEnabled} 
              onChange={() => handleMasterToggle('push')} 
            />
          </div>
          
          <div className={`ml-6 space-y-2 ${!notificationSettings.pushEnabled && 'opacity-50'}`}>
            <Checkbox 
              id="pickup-reminders" 
              checked={notificationSettings.pushNotifications.pickupReminders} 
              onChange={() => notificationSettings.pushEnabled && handlePushToggle('pickupReminders')}
              label="Pickup Reminders"
              disabled={!notificationSettings.pushEnabled}
            />
            
            <Checkbox 
              id="bag-scans" 
              checked={notificationSettings.pushNotifications.bagScans} 
              onChange={() => notificationSettings.pushEnabled && handlePushToggle('bagScans')}
              label="Bag Scans"
              disabled={!notificationSettings.pushEnabled}
            />
            
            <Checkbox 
              id="points-earned" 
              checked={notificationSettings.pushNotifications.pointsEarned} 
              onChange={() => notificationSettings.pushEnabled && handlePushToggle('pointsEarned')}
              label="Points Earned"
              disabled={!notificationSettings.pushEnabled}
            />
            
            <Checkbox 
              id="news-updates" 
              checked={notificationSettings.pushNotifications.newsUpdates} 
              onChange={() => notificationSettings.pushEnabled && handlePushToggle('newsUpdates')}
              label="News & Updates"
              disabled={!notificationSettings.pushEnabled}
            />
          </div>
        </section>

        {/* Email Notifications Section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Email Notifications</h2>
            <ToggleSwitch 
              checked={notificationSettings.emailEnabled} 
              onChange={() => handleMasterToggle('email')} 
            />
          </div>
          
          <div className={`ml-6 space-y-2 ${!notificationSettings.emailEnabled && 'opacity-50'}`}>
            <Checkbox 
              id="weekly-pickup" 
              checked={notificationSettings.emailNotifications.weeklyPickupSummary} 
              onChange={() => notificationSettings.emailEnabled && handleEmailToggle('weeklyPickupSummary')}
              label="Weekly Pickup Summary"
              disabled={!notificationSettings.emailEnabled}
            />
            
            <Checkbox 
              id="monthly-points" 
              checked={notificationSettings.emailNotifications.monthlyPointsSummary} 
              onChange={() => notificationSettings.emailEnabled && handleEmailToggle('monthlyPointsSummary')}
              label="Monthly Points Summary"
              disabled={!notificationSettings.emailEnabled}
            />
            
            <Checkbox 
              id="special-offers" 
              checked={notificationSettings.emailNotifications.specialOffers} 
              onChange={() => notificationSettings.emailEnabled && handleEmailToggle('specialOffers')}
              label="Special Offers & Promotions"
              disabled={!notificationSettings.emailEnabled}
            />
          </div>
        </section>

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
                Save Notification Settings
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Notifications;
