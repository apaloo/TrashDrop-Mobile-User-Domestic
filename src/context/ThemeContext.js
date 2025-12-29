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
    // Check if running in standalone PWA mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        window.navigator.standalone === true;
    
    let retryCount = 0;
    const MAX_RETRIES = 30; // Max 3 seconds wait (30 * 100ms)
    
    const loadTheme = async () => {
      console.log('[ThemeContext] loadTheme triggered, userId:', userId, 'standalone:', isStandalone, 'retry:', retryCount);
      
      // In standalone mode, skip the app-loaded check entirely
      if (!isStandalone) {
        // Wait for app to be loaded, but with a maximum retry limit (browser mode only)
        if (!document.documentElement.classList.contains('app-loaded')) {
          if (retryCount < MAX_RETRIES) {
            console.log('[ThemeContext] App not loaded yet, waiting... (attempt', retryCount + 1, 'of', MAX_RETRIES, ')');
            retryCount++;
            setTimeout(() => loadTheme(), 100);
            return;
          } else {
            console.warn('[ThemeContext] Max retries reached, proceeding with theme load anyway');
          }
        }
      } else {
        console.log('[ThemeContext] Running in standalone mode - skipping app-loaded check, loading immediately');
      }
      
      let themeToApply = 'light';
      
      // Try to load from database first if user is logged in
      if (userId) {
        try {
          console.log('[ThemeContext] Loading theme from database for user:', userId);
          
          // Check if we have a valid session before querying database
          const { data: { session } } = await supabase.auth.getSession();
          
          if (!session) {
            console.warn('[ThemeContext] No active session, skipping database query');
            // Fall through to localStorage
          } else {
            // Add timeout protection for database query (max 3 seconds in standalone, 5 seconds in browser)
            const timeoutDuration = isStandalone ? 3000 : 5000;
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Database query timeout')), timeoutDuration)
            );
            
            const queryPromise = supabase
              .from('profiles')
              .select('dark_mode')
              .eq('id', userId)
              .maybeSingle();
            
            const { data: profileData, error } = await Promise.race([
              queryPromise,
              timeoutPromise
            ]);
            
            if (!error && profileData) {
              themeToApply = profileData.dark_mode ? 'dark' : 'light';
              console.log('[ThemeContext] Loaded theme from database:', themeToApply);
            } else {
              console.log('[ThemeContext] No theme in database, using fallback');
            }
          }
        } catch (error) {
          console.error('[ThemeContext] Error loading theme from database:', error);
          console.warn('[ThemeContext] Falling back to localStorage due to database error');
          // Continue with localStorage fallback below
        }
      }
      
      // Fallback to localStorage if no database theme or no user
      if (!userId || themeToApply === 'light') {
        const savedTheme = localStorage.getItem(appConfig.storage.themeKey);
        if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
          themeToApply = savedTheme;
          console.log('[ThemeContext] Loaded theme from localStorage:', themeToApply);
        } else {
          // Always default to light theme to prevent dark screen issues
          themeToApply = 'light';
          console.log('[ThemeContext] Using default light theme');
        }
      }
      
      // CRITICAL: In standalone mode on relaunch, ensure we don't hang
      // Force light theme if initialization takes too long
      if (isStandalone) {
        console.log('[ThemeContext] Standalone relaunch - ensuring theme is set immediately');
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
