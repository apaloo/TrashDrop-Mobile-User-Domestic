// Find this function in AuthContext.js:
const handleAuthSuccess = useCallback((user, session) => {
  // Add this code at the beginning of the function:
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (isStandalone) {
    console.log("[Auth] PWA mode detected - using enhanced storage");
    import("../utils/pwaHelpers.js").then(({ storePwaAuthData }) => {
      storePwaAuthData(user, session, appConfig?.storage?.tokenKey, appConfig?.storage?.userKey);
    });
    
    // Also use mobile-specific storage for better compatibility
    import("../utils/mobileAuth.js").then(({ storeMobileAuthData, isMobileDevice }) => {
      if (isMobileDevice()) {
        console.log("[Auth] Mobile device detected - using mobile-specific storage");
        storeMobileAuthData(user, session, appConfig?.storage?.tokenKey, appConfig?.storage?.userKey);
      }
    });
  }
