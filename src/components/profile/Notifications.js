import React, { useState } from 'react';

/**
 * Notifications tab component for the Profile page
 * Allows users to configure push and email notification preferences
 */
const Notifications = () => {
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
  const handleSaveSettings = (e) => {
    e.preventDefault();
    // In a real app, this would make an API call to update notification settings
    alert('Notification settings saved!');
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

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
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
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Save Notification Settings
          </button>
        </div>
      </form>
    </div>
  );
};

export default Notifications;
