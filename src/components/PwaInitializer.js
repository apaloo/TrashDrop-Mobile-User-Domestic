import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { isPwaMode, getPwaAuthData } from "../utils/pwaHelpers";

/**
 * Component that handles PWA-specific initialization
 * This ensures proper authentication state restoration in PWA mode
 */
const PwaInitializer = () => {
  const { isAuthenticated, checkSession, handleAuthSuccess } = useAuth();
  const [hasAttemptedRestore, setHasAttemptedRestore] = useState(false);
  const [hasError, setHasError] = useState(false);
  
  // Add a recovery mechanism for blank screens
  useEffect(() => {
    // This runs only in PWA mode
    if (\!isPwaMode()) return;
    
    // If we detect a potential blank screen (no content after 3 seconds)
    const blankScreenTimeout = setTimeout(() => {
      const mainContent = document.querySelector('main') || 
                          document.querySelector('.app-content') || 
                          document.querySelector('#root > div');
      
      if (\!mainContent || mainContent.children.length === 0) {
        console.error('[PwaInitializer] Potential blank screen detected, attempting recovery');
        
        try {
          // Force a hard reload
          window.location.href = '/dashboard';
          
          // If that doesn't work, try clearing some cache and reloading
          setTimeout(() => {
            try {
              // Clear any potentially problematic cache
              localStorage.removeItem('trashdrop_last_path');
              sessionStorage.removeItem('trashdrop_last_path');
              
              // Force reload to root
              window.location.href = '/';
            } catch (e) {
              console.error('[PwaInitializer] Recovery attempt failed:', e);
            }
          }, 1000);
        } catch (e) {
          console.error('[PwaInitializer] Error during recovery:', e);
        }
      }
    }, 3000);
    
    return () => clearTimeout(blankScreenTimeout);
  }, []);
  
  useEffect(() => {
    const initializePwa = async () => {
      // Only run in PWA mode
      if (\!isPwaMode()) {
        console.log("[PwaInitializer] Not in PWA mode, skipping initialization");
        return;
      }
      
      // Prevent multiple attempts
      if (hasAttemptedRestore) {
        return;
      }
      
      setHasAttemptedRestore(true);
      console.log("[PwaInitializer] PWA mode detected, initializing...");
      
      try {
        // If already authenticated, no need to restore
        if (isAuthenticated) {
          console.log("[PwaInitializer] Already authenticated, skipping restoration");
          return;
        }
        
        // Try to get stored PWA auth data
        const pwaAuthData = getPwaAuthData();
        
        if (pwaAuthData?.user && pwaAuthData?.token) {
          console.log("[PwaInitializer] Found stored PWA credentials, restoring session");
          
          try {
            // First try to refresh the session with Supabase
            await checkSession(true);
            console.log("[PwaInitializer] Session refreshed successfully");
          } catch (error) {
            console.error("[PwaInitializer] Error refreshing session:", error);
            
            // If refresh fails, try to use stored credentials
            if (pwaAuthData.isPwaAuthenticated) {
              console.log("[PwaInitializer] Using stored PWA credentials as fallback");
              handleAuthSuccess(pwaAuthData.user, { access_token: pwaAuthData.token });
            }
          }
        } else {
          console.log("[PwaInitializer] No stored PWA credentials found");
        }
      } catch (error) {
        console.error("[PwaInitializer] Error during PWA initialization:", error);
        setHasError(true);
      }
    };
    
    // Run initialization with a slight delay to ensure other components are mounted
    const timer = setTimeout(() => {
      initializePwa();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [isAuthenticated, checkSession, handleAuthSuccess, hasAttemptedRestore]);
  
  // Render an error message if initialization failed
  if (hasError && isPwaMode()) {
    return (
      <div style={{
        position: 'fixed',
        bottom: '10px',
        left: '10px',
        right: '10px',
        backgroundColor: 'rgba(255, 0, 0, 0.8)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        fontSize: '12px',
        zIndex: 9999
      }}>
        Error initializing PWA. Try refreshing the app.
      </div>
    );
  }
  
  // This component doesn't render anything in normal operation
  return null;
};

export default PwaInitializer;
