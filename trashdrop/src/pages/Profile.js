import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import PersonalInfo from '../components/profile/PersonalInfo.js';
import Locations from '../components/profile/Locations.js';
import Preferences from '../components/profile/Preferences.js';
import Notifications from '../components/profile/Notifications.js';
import Security from '../components/profile/Security.js';

/**
 * Profile page component that displays user profile information and settings
 * with tab-based navigation between different sections
 */
const Profile = () => {
  const location = useLocation();

  // Tab configuration
  const tabs = [
    { id: 'personal', label: 'Personal Info' },
    { id: 'locations', label: 'Locations' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'security', label: 'Security' }
  ];

  // Determine initial tab from query string (?tab=locations) if present
  const initialTab = useMemo(() => {
    try {
      const searchParams = new URLSearchParams(location.search);
      const tabFromUrl = searchParams.get('tab');
      const isValidTab = tabs.some(tab => tab.id === tabFromUrl);
      return isValidTab ? tabFromUrl : 'personal';
    } catch (error) {
      console.warn('[Profile] Unable to parse tab from URL:', error);
      return 'personal';
    }
  }, [location.search, tabs]);

  // State to track the active tab
  const [activeTab, setActiveTab] = useState(initialTab);

  // Render the tab content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'personal':
        return <PersonalInfo />;
      case 'locations':
        return <Locations />;
      case 'preferences':
        return <Preferences />;
      case 'notifications':
        return <Notifications />;
      case 'security':
        return <Security />;
      default:
        return <PersonalInfo />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <h1 className="text-2xl font-bold p-4 mb-4 text-gray-900 dark:text-white">Profile & Settings</h1>

      {/* Tab navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <div className="flex overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'text-blue-500 dark:text-blue-400 border-b-2 border-blue-500 dark:border-blue-400 font-medium' 
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-4">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default Profile;
