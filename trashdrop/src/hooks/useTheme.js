import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import supabase from '../utils/supabaseClient.js';

/**
 * Custom hook to manage theme (dark mode) globally across the app
 * Loads theme preference from database and applies it on mount
 */
export const useTheme = () => {
  const { user } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load theme preference from database on mount
  useEffect(() => {
    const loadThemePreference = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        console.log('[useTheme] Loading theme preference for user:', user.id);
        
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('dark_mode')
          .eq('id', user.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          console.error('[useTheme] Error loading theme:', error);
          return;
        }

        const darkModeEnabled = profileData?.dark_mode || false;
        setIsDarkMode(darkModeEnabled);
        
        // Apply theme to document
        applyTheme(darkModeEnabled);
        
        console.log('[useTheme] Theme loaded and applied:', darkModeEnabled ? 'dark' : 'light');
      } catch (error) {
        console.error('[useTheme] Error in loadThemePreference:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThemePreference();
  }, [user?.id]);

  // Function to apply theme
  const applyTheme = (isDark) => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  };

  // Function to toggle theme
  const toggleTheme = async () => {
    if (!user?.id) return;

    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    applyTheme(newDarkMode);

    try {
      await supabase
        .from('profiles')
        .update({ dark_mode: newDarkMode })
        .eq('id', user.id);
      
      console.log('[useTheme] Theme updated in database:', newDarkMode ? 'dark' : 'light');
    } catch (error) {
      console.error('[useTheme] Error updating theme:', error);
    }
  };

  return {
    isDarkMode,
    isLoading,
    toggleTheme,
    applyTheme
  };
};

export default useTheme;
