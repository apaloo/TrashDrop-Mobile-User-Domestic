import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import supabase from '../../utils/supabaseClient.js';

/**
 * Preferences tab component for the Profile page
 * Allows users to configure theme, language, and accessibility settings
 */
const Preferences = () => {
  const { user } = useAuth();
  const { theme: globalTheme } = useTheme();
  
  // State for user preferences
  const [preferences, setPreferences] = useState({
    darkMode: false,
    language: 'en-US',
    highContrast: false,
    largerText: false,
    reduceMotion: false
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  // Load preferences from database on mount
  useEffect(() => {
    const loadPreferences = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }
      
      try {
        setIsLoading(true);
        console.log('[Preferences] Loading preferences for user:', user.id);
        
        // Fetch user preferences from Supabase profiles table
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('dark_mode, language, notification_preferences')
          .eq('id', user.id)
          .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
          console.error('[Preferences] Error loading preferences:', error);
          throw error;
        }
        
        if (profileData) {
          // Extract accessibility settings from notification_preferences if available
          const accessibilitySettings = profileData.notification_preferences?.accessibility || {};
          
          const loadedPreferences = {
            darkMode: profileData.dark_mode || false,
            language: profileData.language || 'en-US',
            highContrast: accessibilitySettings.highContrast || false,
            largerText: accessibilitySettings.largerText || false,
            reduceMotion: accessibilitySettings.reduceMotion || false
          };
          
          setPreferences(loadedPreferences);
          console.log('[Preferences] Preferences loaded successfully:', loadedPreferences);
        }
      } catch (error) {
        console.error('[Preferences] Error in loadPreferences:', error);
        setSaveMessage({ type: 'error', text: 'Failed to load preferences' });
        setTimeout(() => setSaveMessage(null), 3000);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadPreferences();
  }, [user?.id]);
  
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
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!user?.id) {
      setSaveMessage({ type: 'error', text: 'You must be logged in to save preferences' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }
    
    try {
      setIsSaving(true);
      console.log('[Preferences] Saving preferences for user:', user.id);
      
      // First, get the current notification_preferences to merge with
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('id', user.id)
        .maybeSingle();
      
      // Prepare accessibility settings
      const accessibilitySettings = {
        highContrast: preferences.highContrast,
        largerText: preferences.largerText,
        reduceMotion: preferences.reduceMotion
      };
      
      // Merge with existing notification_preferences
      const updatedNotificationPrefs = {
        ...(currentProfile?.notification_preferences || {}),
        accessibility: accessibilitySettings
      };
      
      console.log('[Preferences] Saving notification_preferences:', updatedNotificationPrefs);
      
      // Update preferences in Supabase
      const { error } = await supabase
        .from('profiles')
        .update({
          dark_mode: preferences.darkMode,
          language: preferences.language,
          notification_preferences: updatedNotificationPrefs,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
      
      if (error) {
        console.error('[Preferences] Error saving preferences:', error);
        throw error;
      }
      
      console.log('[Preferences] Preferences saved successfully');
      setSaveMessage({ type: 'success', text: 'Preferences saved successfully! Reloading...' });
      
      // Dispatch custom event to notify ThemeContext of theme change
      window.dispatchEvent(new CustomEvent('theme-changed', { 
        detail: { darkMode: preferences.darkMode } 
      }));
      
      // Reload page after short delay to apply theme globally
      setTimeout(() => {
        window.location.reload();
      }, 1500);
      
    } catch (error) {
      console.error('[Preferences] Error in handleSubmit:', error);
      setSaveMessage({ type: 'error', text: 'Failed to save preferences. Please try again.' });
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setIsSaving(false);
    }
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

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading preferences...</span>
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
      <form onSubmit={handleSubmit}>
        {/* Theme Section */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Theme</h2>
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
            <label htmlFor="dark-mode" className="cursor-pointer text-gray-900 dark:text-gray-100">
              Dark Mode
            </label>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-14">Enable dark theme for better viewing in low light</p>
        </section>

        {/* Language Section */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Language</h2>
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
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Accessibility</h2>
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
              <label htmlFor="high-contrast" className="cursor-pointer text-gray-900 dark:text-gray-100">
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
              <label htmlFor="larger-text" className="cursor-pointer text-gray-900 dark:text-gray-100">
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
              <label htmlFor="reduce-motion" className="cursor-pointer text-gray-900 dark:text-gray-100">
                Reduce Motion
              </label>
            </div>
          </div>
        </section>

        {/* Save Button */}
        <div className="mt-8 flex justify-end">
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
                Save Preferences
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Preferences;
