import React, { createContext, useContext, useState, useEffect } from 'react';
import appConfig from '../utils/app-config.js';
import supabase from '../utils/supabaseClient.js';

const ThemeContext = createContext(null);

/** 'dark' or 'light': the theme last applied on this device */
export const readDeviceTheme = () => {
  try {
    return localStorage.getItem(appConfig.storage.themeKey) === 'dark' ? 'dark' : 'light';
  } catch (err) {
    return 'light';
  }
};

// Profile > Preferences > Accessibility: classes on <html> (see index.css)
const ACCESSIBILITY_CLASSES = { largerText: 'td-larger-text', reduceMotion: 'td-reduce-motion' };
export const applyAccessibility = (settings = {}) => {
  Object.entries(ACCESSIBILITY_CLASSES).forEach(([key, cls]) => {
    document.documentElement.classList.toggle(cls, !!settings[key]);
  });
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  console.log('[ThemeContext] 🚀 ThemeProvider component mounting');
  
  // Start with the theme last used on this device, so pages shown before
  // sign-in (Sign in, Sign up, password reset) match it
  const [theme, setTheme] = useState(readDeviceTheme);
  const [isInitialized, setIsInitialized] = useState(false);
  const [userId, setUserId] = useState(null);
  
  console.log('[ThemeContext] 📊 Initial state:', { theme, isInitialized, userId });

  // Listen for auth state changes to get user ID
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
      } else {
        // Signed out: keep the theme the device was using; the next
        // sign-in loads that account's own setting
        setUserId(null);
        setIsInitialized(false);
        applyAccessibility({});
      }
    });

    // Get current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Load theme when user ID changes - simplified version
    if (!userId) return;
    
    // Prevent multiple simultaneous loads
    if (isInitialized) return;
    
    const loadTheme = async () => {
      console.log('[ThemeContext] Loading theme for user:', userId);
      
      let themeToApply = 'light'; // Default theme
      
      try {
        // Try to load from database first
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          const { data: profileData, error } = await supabase
            .from('profiles')
            .select('dark_mode, notification_preferences')
            .eq('id', userId)
            .maybeSingle();
          
          if (!error && profileData) {
            themeToApply = profileData.dark_mode ? 'dark' : 'light';
            applyAccessibility(profileData.notification_preferences?.accessibility);
            console.log('[ThemeContext] Theme from database:', themeToApply);
          }
        }
      } catch (error) {
        console.error('[ThemeContext] Database query failed:', error);
      }
      
      console.log('[ThemeContext] Final theme applied:', themeToApply);
      setTheme(themeToApply);
      setIsInitialized(true);
    };
    
    loadTheme();
  }, [userId]); // Only depend on userId

  useEffect(() => {
    {
      // Apply theme to document
      document.documentElement.setAttribute('data-theme', theme);
      
      // CRITICAL: Also toggle 'dark' class for Tailwind
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      
      // Remember it on this device for the signed-out pages
      try { localStorage.setItem(appConfig.storage.themeKey, theme); } catch (err) { /* storage blocked */ }
      
      console.log('[Theme] Applied theme:', theme);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  // Set the theme from a setting (Profile > Preferences): applies at once
  const setThemeMode = (mode) => {
    setTheme(mode === 'dark' ? 'dark' : 'light');
    setIsInitialized(true);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;
