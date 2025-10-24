import React, { createContext, useContext, useState, useEffect } from 'react';
import appConfig from '../utils/app-config.js';

const ThemeContext = createContext(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  // Always start with light theme during initialization
  const [theme, setTheme] = useState('light');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Wait for app to be loaded before applying saved theme
    const checkAppLoaded = () => {
      if (document.documentElement.classList.contains('app-loaded')) {
        // App has loaded, now we can safely apply the saved theme
        const savedTheme = localStorage.getItem(appConfig.storage.themeKey);
        if (savedTheme) {
          setTheme(savedTheme);
        } else {
          // Check for system preference only after app loads
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          setTheme(prefersDark ? 'dark' : 'light');
        }
        setIsInitialized(true);
      } else {
        // App not loaded yet, check again in 100ms
        setTimeout(checkAppLoaded, 100);
      }
    };
    
    // Start checking after a small delay
    const timeoutId = setTimeout(checkAppLoaded, 100);
    
    return () => clearTimeout(timeoutId);
  }, []);

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
