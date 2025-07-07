import React, { useState } from 'react';

/**
 * Preferences tab component for the Profile page
 * Allows users to configure theme, language, and accessibility settings
 */
const Preferences = () => {
  // State for user preferences
  const [preferences, setPreferences] = useState({
    darkMode: false,
    language: 'en-US',
    highContrast: false,
    largerText: false,
    reduceMotion: false
  });

  // Handle toggle changes
  const handleToggleChange = (name) => {
    setPreferences({
      ...preferences,
      [name]: !preferences[name]
    });
  };

  // Handle language selection change
  const handleLanguageChange = (e) => {
    setPreferences({
      ...preferences,
      language: e.target.value
    });
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    // In a real app, this would make an API call to update user preferences
    alert('Preferences saved successfully!');
  };

  // Available languages
  const languages = [
    { code: 'en-US', label: 'English (US)' },
    { code: 'en-GB', label: 'English (UK)' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'pt', label: 'Português' },
    { code: 'zh', label: '中文' }
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      <form onSubmit={handleSubmit}>
        {/* Theme Section */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Theme</h2>
          <div className="flex items-center">
            <div className="relative inline-block w-12 mr-2 align-middle select-none">
              <input 
                type="checkbox" 
                id="dark-mode" 
                checked={preferences.darkMode}
                onChange={() => handleToggleChange('darkMode')}
                className="absolute block w-6 h-6 bg-white border-4 rounded-full appearance-none cursor-pointer"
                style={{
                  top: '0.25rem',
                  left: preferences.darkMode ? '6px' : '0px',
                  transition: 'left 0.2s ease-in-out',
                  backgroundColor: preferences.darkMode ? '#4299e1' : '#fff',
                  borderColor: preferences.darkMode ? '#4299e1' : '#d1d5db'
                }}
              />
              <label 
                htmlFor="dark-mode" 
                className={`block overflow-hidden h-6 rounded-full cursor-pointer ${
                  preferences.darkMode ? 'bg-blue-300' : 'bg-gray-300'
                }`}
              ></label>
            </div>
            <label htmlFor="dark-mode" className="cursor-pointer">
              Dark Mode
            </label>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-14">Enable dark theme for better viewing in low light</p>
        </section>

        {/* Language Section */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Language</h2>
          <div>
            <select
              id="language"
              name="language"
              value={preferences.language}
              onChange={handleLanguageChange}
              className="w-full md:w-72 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {languages.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.label}</option>
              ))}
            </select>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Select your preferred language for the application
            </p>
          </div>
        </section>

        {/* Accessibility Section */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Accessibility</h2>
          <div className="space-y-4">
            {/* High Contrast */}
            <div className="flex items-center">
              <div className="relative inline-block w-12 mr-2 align-middle select-none">
                <input 
                  type="checkbox" 
                  id="high-contrast" 
                  checked={preferences.highContrast}
                  onChange={() => handleToggleChange('highContrast')}
                  className="absolute block w-6 h-6 bg-white border-4 rounded-full appearance-none cursor-pointer"
                  style={{
                    top: '0.25rem',
                    left: preferences.highContrast ? '6px' : '0px',
                    transition: 'left 0.2s ease-in-out',
                    backgroundColor: preferences.highContrast ? '#4299e1' : '#fff',
                    borderColor: preferences.highContrast ? '#4299e1' : '#d1d5db'
                  }}
                />
                <label 
                  htmlFor="high-contrast" 
                  className={`block overflow-hidden h-6 rounded-full cursor-pointer ${
                    preferences.highContrast ? 'bg-blue-300' : 'bg-gray-300'
                  }`}
                ></label>
              </div>
              <label htmlFor="high-contrast" className="cursor-pointer">
                High Contrast
              </label>
            </div>

            {/* Larger Text */}
            <div className="flex items-center">
              <div className="relative inline-block w-12 mr-2 align-middle select-none">
                <input 
                  type="checkbox" 
                  id="larger-text" 
                  checked={preferences.largerText}
                  onChange={() => handleToggleChange('largerText')}
                  className="absolute block w-6 h-6 bg-white border-4 rounded-full appearance-none cursor-pointer"
                  style={{
                    top: '0.25rem',
                    left: preferences.largerText ? '6px' : '0px',
                    transition: 'left 0.2s ease-in-out',
                    backgroundColor: preferences.largerText ? '#4299e1' : '#fff',
                    borderColor: preferences.largerText ? '#4299e1' : '#d1d5db'
                  }}
                />
                <label 
                  htmlFor="larger-text" 
                  className={`block overflow-hidden h-6 rounded-full cursor-pointer ${
                    preferences.largerText ? 'bg-blue-300' : 'bg-gray-300'
                  }`}
                ></label>
              </div>
              <label htmlFor="larger-text" className="cursor-pointer">
                Larger Text
              </label>
            </div>

            {/* Reduce Motion */}
            <div className="flex items-center">
              <div className="relative inline-block w-12 mr-2 align-middle select-none">
                <input 
                  type="checkbox" 
                  id="reduce-motion" 
                  checked={preferences.reduceMotion}
                  onChange={() => handleToggleChange('reduceMotion')}
                  className="absolute block w-6 h-6 bg-white border-4 rounded-full appearance-none cursor-pointer"
                  style={{
                    top: '0.25rem',
                    left: preferences.reduceMotion ? '6px' : '0px',
                    transition: 'left 0.2s ease-in-out',
                    backgroundColor: preferences.reduceMotion ? '#4299e1' : '#fff',
                    borderColor: preferences.reduceMotion ? '#4299e1' : '#d1d5db'
                  }}
                />
                <label 
                  htmlFor="reduce-motion" 
                  className={`block overflow-hidden h-6 rounded-full cursor-pointer ${
                    preferences.reduceMotion ? 'bg-blue-300' : 'bg-gray-300'
                  }`}
                ></label>
              </div>
              <label htmlFor="reduce-motion" className="cursor-pointer">
                Reduce Motion
              </label>
            </div>
          </div>
        </section>

        {/* Save Button */}
        <div className="mt-8 flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Save Preferences
          </button>
        </div>
      </form>
    </div>
  );
};

export default Preferences;
