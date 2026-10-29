import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useTheme, applyAccessibility } from '../../context/ThemeContext.js';
import supabase from '../../utils/supabaseClient.js';
import Switch from './Switch.js';

// One setting: a switch and its label (outside the component so a change keeps keyboard focus)
const Row = ({ id, label, hint, checked, onChange }) => (
  <div>
    <div className="flex items-center">
      <Switch id={id} checked={checked} onChange={onChange} labelledBy={`${id}-label`} />
      <label htmlFor={id} id={`${id}-label`} className="ml-3 cursor-pointer text-td-ink dark:text-gray-100">
        {label}
      </label>
    </div>
    {hint && <p className="text-sm text-td-sage dark:text-gray-300 mt-1 ml-[60px]">{hint}</p>}
  </div>
);

/**
 * Preferences tab component for the Profile page.
 * Each setting applies the moment it is switched and is saved straight away.
 * (High contrast and language were offered here but nothing used them; they
 * return when they are built. Saved values are left as they are.)
 */
const Preferences = () => {
  const { user } = useAuth();
  const { setThemeMode } = useTheme();

  const [preferences, setPreferences] = useState({
    darkMode: false,
    largerText: false,
    reduceMotion: false
  });

  const [isLoading, setIsLoading] = useState(true);
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
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('dark_mode, notification_preferences')
          .eq('id', user.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          console.error('[Preferences] Error loading preferences:', error);
          throw error;
        }

        if (profileData) {
          const accessibility = profileData.notification_preferences?.accessibility || {};
          setPreferences({
            darkMode: profileData.dark_mode || false,
            largerText: accessibility.largerText || false,
            reduceMotion: accessibility.reduceMotion || false
          });
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

  const showSaveError = () => {
    setSaveMessage({ type: 'error', text: 'This is on for now, but could not be saved. Please try again.' });
    setTimeout(() => setSaveMessage(null), 5000);
  };

  // Dark mode: applies at once and is saved straight away
  const handleDarkModeChange = async (on) => {
    setPreferences(prev => ({ ...prev, darkMode: on }));
    setThemeMode(on ? 'dark' : 'light');
    if (!user?.id) return;
    const { error } = await supabase
      .from('profiles')
      .update({ dark_mode: on, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) {
      console.error('[Preferences] Error saving dark mode:', error);
      showSaveError();
    }
  };

  // Larger text and reduce motion: apply at once and are saved straight away,
  // kept with the other accessibility values in notification_preferences
  const handleAccessibilityChange = async (name, on) => {
    const next = { ...preferences, [name]: on };
    setPreferences(next);
    applyAccessibility({ largerText: next.largerText, reduceMotion: next.reduceMotion });
    if (!user?.id) return;
    try {
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('id', user.id)
        .maybeSingle();
      const current = currentProfile?.notification_preferences || {};
      const { error } = await supabase
        .from('profiles')
        .update({
          notification_preferences: {
            ...current,
            accessibility: { ...(current.accessibility || {}), [name]: on }
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
      if (error) throw error;
    } catch (error) {
      console.error('[Preferences] Error saving accessibility setting:', error);
      showSaveError();
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-td-forest"></div>
          <span className="ml-3 text-td-sage dark:text-gray-300">Loading preferences...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      {saveMessage && (
        <div role="alert" className={`mb-4 p-3 rounded-md ${
          saveMessage.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`}>
          {saveMessage.text}
        </div>
      )}

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-td-ink dark:text-gray-100">Theme</h2>
        <Row
          id="dark-mode"
          label="Dark Mode"
          hint="Enable dark theme for better viewing in low light"
          checked={preferences.darkMode}
          onChange={handleDarkModeChange}
        />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4 text-td-ink dark:text-gray-100">Accessibility</h2>
        <div className="space-y-4">
          <Row
            id="larger-text"
            label="Larger Text"
            hint="Makes text across the app bigger"
            checked={preferences.largerText}
            onChange={(on) => handleAccessibilityChange('largerText', on)}
          />
          <Row
            id="reduce-motion"
            label="Reduce Motion"
            hint="Turns off animations and smooth scrolling"
            checked={preferences.reduceMotion}
            onChange={(on) => handleAccessibilityChange('reduceMotion', on)}
          />
        </div>
      </section>

      <p className="mt-8 text-sm text-td-sage dark:text-gray-300">Changes are saved as you make them.</p>
    </div>
  );
};

export default Preferences;
