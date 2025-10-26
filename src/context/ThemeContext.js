import React, { createContext, useContext, useState, useEffect } from 'react';
import appConfig from '../utils/app-config.js';
import supabase from '../utils/supabaseClient.js';

const ThemeContext = createContext(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  console.log('[ThemeContext] 🚀 ThemeProvider component mounting');
  
  // Always start with light theme during initialization
  const [theme, setTheme] = useState('light');
  const [isInitialized, setIsInitialized] = useState(false);
  const [userId, setUserId] = useState(null);
  
  console.log('[ThemeContext] 📊 Initial state:', { theme, isInitialized, userId });

  // Listen for auth state changes to get user ID
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
      } else {
        setUserId(null);
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
    // Load theme when user ID changes
    const loadTheme = async () => {
      console.log('[ThemeContext] loadTheme triggered, userId:', userId);
      
      // Wait for app to be loaded
      if (!document.documentElement.classList.contains('app-loaded')) {
        console.log('[ThemeContext] App not loaded yet, waiting...');
        setTimeout(loadTheme, 100);
        return;
      }
      
      let themeToApply = 'light';
      
      // Try to load from database first if user is logged in
      if (userId) {
        try {
          console.log('[ThemeContext] Loading theme from database for user:', userId);
          const { data: profileData, error } = await supabase
            .from('profiles')
            .select('dark_mode')
            .eq('id', userId)
            .maybeSingle();
          
          if (!error && profileData) {
            themeToApply = profileData.dark_mode ? 'dark' : 'light';
            console.log('[ThemeContext] Loaded theme from database:', themeToApply);
          } else {
            console.log('[ThemeContext] No theme in database, using fallback');
          }
        } catch (error) {
          console.error('[ThemeContext] Error loading theme from database:', error);
        }
      }
      
      // Fallback to localStorage if no database theme or no user
      if (!userId || themeToApply === 'light') {
        const savedTheme = localStorage.getItem(appConfig.storage.themeKey);
        if (savedTheme) {
          themeToApply = savedTheme;
          console.log('[ThemeContext] Loaded theme from localStorage:', themeToApply);
        } else {
          // Check for system preference only after app loads
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          themeToApply = prefersDark ? 'dark' : 'light';
          console.log('[ThemeContext] Using system preference:', themeToApply);
        }
      }
      
      console.log('[ThemeContext] Final theme to apply:', themeToApply);
      setTheme(themeToApply);
      setIsInitialized(true);
    };
    
    loadTheme();
  }, [userId]);

  useEffect(() => {
    // Only apply theme after initialization
    if (isInitialized) {
      // Apply theme to document
      document.documentElement.setAttribute('data-theme', theme);
      
      // CRITICAL: Also toggle 'dark' class for Tailwind
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      
      // Save theme preference to localStorage
      localStorage.setItem(appConfig.storage.themeKey, theme);
      
      console.log('[Theme] Applied theme:', theme);
    }
  }, [theme, isInitialized]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;
