import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import PersonalInfo from '../components/profile/PersonalInfo.js';
import Locations from '../components/profile/Locations.js';
import Preferences from '../components/profile/Preferences.js';
import Security from '../components/profile/Security.js';
import PageHeader from '../components/ui/PageHeader.js';

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
    // Notifications returns when the app sends push and email by these settings
    // (components/profile/Notifications.js); nothing sends them yet
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
      case 'security':
        return <Security />;
      default:
        return <PersonalInfo />;
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-2 pb-24">
      <PageHeader title="Profile & Settings" subtitle="Your details, saved places and how the app works for you." />

      {/* Tab navigation */}
      <div className="flex gap-2 overflow-x-auto py-4 -mx-2 px-2" role="tablist" aria-label="Profile sections" style={{ scrollbarWidth: 'none' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={(e) => {
              setActiveTab(tab.id);
              // The row scrolls sideways on phones: bring the chosen tab fully into view
              e.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
            }}
            // The row scrolls sideways, which clips anything outside it: keep the focus ring inside the tab
            className={`h-9 px-4 rounded-full text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-offset-[-3px] ${
              activeTab === tab.id
                ? 'bg-td-forest text-white'
                : 'bg-td-tonal text-td-forest-dk hover:bg-[#d5eadb] dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div role="tabpanel">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default Profile;
