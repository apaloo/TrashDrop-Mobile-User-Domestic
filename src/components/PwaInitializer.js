import React, { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { isPwaMode, getPwaAuthData } from "../utils/pwaHelpers";

/**
 * Component that handles PWA-specific initialization
 * This ensures proper authentication state restoration in PWA mode
 */
const PwaInitializer = () => {
  const { isAuthenticated, checkSession, handleAuthSuccess } = useAuth();
  
  useEffect(() => {
    const initializePwa = async () => {
      // Only run in PWA mode
      if (!isPwaMode()) {
        console.log("[PwaInitializer] Not in PWA mode, skipping initialization");
        return;
      }
      
      console.log("[PwaInitializer] PWA mode detected, initializing...");
      
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
    };
    
    // Run initialization with a slight delay to ensure other components are mounted
    const timer = setTimeout(() => {
      initializePwa();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [isAuthenticated, checkSession, handleAuthSuccess]);
  
  // This component doesn't render anything
  return null;
};

export default PwaInitializer;
