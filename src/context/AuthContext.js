import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import supabase, { isTokenValid } from '../utils/supabaseClient.js';
import { logAuthError, ERROR_CATEGORIES } from '../utils/errorLogger.js';
import performanceMonitor from '../utils/performanceMonitor.js';
import appConfigImport from '../utils/app-config.js';

// Safe app config access with fallbacks
const appConfig = appConfigImport || {
  storage: { userKey: 'trashdrop_user', tokenKey: 'trashdrop_auth_token' },
  features: { enableMocks: false }
};

/**
 * Get the stored user from localStorage
 * @returns {Object|null} The user object or null if not found
 */
const getStoredUser = () => {
  try {
    if (typeof localStorage === 'undefined') return null;
    
    const userKey = appConfig?.storage?.userKey || 'trashdrop_user';
    const storedUser = localStorage.getItem(userKey);
    return storedUser ? JSON.parse(storedUser) : null;
  } catch (error) {
    console.error('[Auth] Error getting stored user:', error);
    return null;
  }
};

/**
 * Auth state constants
 */
const AUTH_STATES = {
  INITIAL: 'INITIAL',
  LOADING: 'LOADING',
  AUTHENTICATED: 'AUTHENTICATED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  ERROR: 'ERROR'
};

// Create the auth context
const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  // Auth state - Initialize with stored user if available to prevent race conditions
  const [authState, setAuthState] = useState(() => {
    // Check for stored user during initialization
    const storedUser = getStoredUser();
    const storedToken = localStorage.getItem('trashdrop_auth_token');
    
    console.log('[AuthContext INIT] Checking for stored credentials:', {
      hasStoredUser: !!storedUser,
      hasStoredToken: !!storedToken,
      userEmail: storedUser?.email
    });
    
    if (storedUser && storedToken) {
      console.log('[AuthContext INIT] ✅ Found stored credentials, initializing as AUTHENTICATED');
      return {
        status: AUTH_STATES.AUTHENTICATED,
        user: storedUser,
        error: null,
        retryCount: 0,
        lastAction: 'init_with_stored_user',
        session: { access_token: storedToken }
      };
    }
    
    console.log('[AuthContext INIT] ❌ No stored credentials, initializing as INITIAL');
    return {
      status: AUTH_STATES.INITIAL,
      user: null,
      error: null,
      retryCount: 0,
      lastAction: null,
      session: null
    };
  });
  
  // Derived state for convenience
  const isAuthenticated = authState.status === AUTH_STATES.AUTHENTICATED;
  // Only show loading for explicit LOADING state, not INITIAL
  // INITIAL with stored credentials goes directly to AUTHENTICATED (no loading)
  const isLoading = authState.status === AUTH_STATES.LOADING;
  const error = authState.error;
  
  // Debug logging for auth state changes (only in development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[AuthContext] Auth state changed:', {
        status: authState.status,
        isAuthenticated,
        isLoading,
        hasUser: !!authState.user,
        userEmail: authState.user?.email,
        lastAction: authState.lastAction
      });
    }
  }, [authState.status, isAuthenticated, isLoading, authState.user, authState.lastAction]);
  
  // Function to clear all auth-related storage
  const clearAuthData = useCallback(() => {
    console.log('[Auth] Clearing authentication data');
    
    if (typeof localStorage === 'undefined') return;
    
    // Clear all Supabase and app-specific auth data
    const keysToRemove = [
      // Supabase keys
      ...Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
        .filter(key => key && (key.includes('supabase') || key.includes('sb-'))),
      // App-specific keys
      appConfig?.storage?.userKey || 'trashdrop_user',
      appConfig?.storage?.tokenKey || 'trashdrop_auth_token'
    ];
    
    // Remove duplicates
    const uniqueKeys = [...new Set(keysToRemove)];
    
    uniqueKeys.forEach(key => {
      if (key) {
        localStorage.removeItem(key);
        console.log(`[Auth] Removed from localStorage: ${key}`);
      }
    });
  }, []);
  
  // Loading timeout to prevent infinite loading state
  const loadingTimeoutRef = useRef(null);
  
  // Reset any existing loading timeouts
  const clearLoadingTimeout = () => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  };
  
  // Update auth state helper
  const updateAuthState = useCallback((newState) => {
    // Clear any existing loading timeouts
    clearLoadingTimeout();
    
    // Set a new timeout if entering LOADING state to prevent infinite loading
    if (newState.status === AUTH_STATES.LOADING) {
      loadingTimeoutRef.current = setTimeout(() => {
        // If we're still loading after timeout, update to error state
        if (authState.status === AUTH_STATES.LOADING) {
          console.warn('[Auth] Loading timeout reached after 15 seconds');
          setAuthState(prev => {
            // Only update if still in loading state
            if (prev.status === AUTH_STATES.LOADING) {
              return {
                ...prev,
                status: AUTH_STATES.ERROR,
                error: {
                  message: 'Authentication timed out. Please try again.',
                  code: 'AUTH_TIMEOUT',
                  isRecoverable: true
                },
                lastAction: 'timeout'
              };
            }
            return prev;
          });
        }
      }, 15000); // 15 second timeout
    }
    
    setAuthState((prevState) => {
      // Check if critical fields have changed to prevent unnecessary updates
      const hasCriticalChange = 
        prevState.status !== newState.status ||
        prevState.user !== newState.user ||
        prevState.session !== newState.session ||
        prevState.error !== newState.error ||
        prevState.lastAction !== newState.lastAction;

      if (!hasCriticalChange) {
        return prevState; // No critical changes, skip update
      }

      // Include lastUpdated only if it's a significant state transition
      if (newState.status === AUTH_STATES.AUTHENTICATED || 
          newState.status === AUTH_STATES.UNAUTHENTICATED || 
          newState.status === AUTH_STATES.ERROR) {
        return { 
          ...prevState, 
          ...newState, 
          lastUpdated: new Date().toISOString() 
        };
      }
      return { 
        ...prevState, 
        ...newState 
      };
    });
  }, []);
  
  // Reset auth state function
  const resetAuthState = useCallback(async (error = null) => {
    console.log('[Auth] Resetting authentication state');
    
    // Clear all auth data
    clearAuthData();
    
    // Update state to unauthenticated or error
    updateAuthState({
      status: error ? AUTH_STATES.ERROR : AUTH_STATES.UNAUTHENTICATED,
      user: null,
      session: null,
      error: error || null,
      lastAction: 'reset',
      retryCount: 0,
      lastUpdated: new Date().toISOString(),
      previousState: authState.status === AUTH_STATES.AUTHENTICATED ? 'was_authenticated' : 'was_unauthenticated'
    });
    
    try {
      // Force signOut to clean up any lingering session data
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
      
      if (signOutError) {
        console.error('[Auth] Error during sign out:', signOutError);
        // Even if sign out fails, we've already cleared local data
      }
      
      // Clear any remaining Supabase-related data
      if (typeof window !== 'undefined') {
        // Clear any session storage that might be used by Supabase
        sessionStorage.clear();
        
        // Clear cookies that might be used for auth
        document.cookie.split(';').forEach(c => {
          document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
        });
      }
    } catch (signOutErr) {
      console.error('[Auth] Error during sign out cleanup:', signOutErr);
      // Continue with reset even if cleanup fails
    }
    
    console.log('[Auth] Auth state reset complete');
    return { success: true };
  }, [clearAuthData, updateAuthState, authState.status]);
  
  // Track if session check is in progress to prevent multiple concurrent checks
  const isCheckingSession = useRef(false);
  
  // Track if auth has been initialized to prevent multiple initializations
  const isAuthInitialized = useRef(false);
  
  // Start a timeout to prevent infinite loading state
  const startLoadingTimeout = () => {
    // Clear any existing timeout first
    clearLoadingTimeout();
    
    // Set a new timeout (30 seconds)
    loadingTimeoutRef.current = setTimeout(() => {
      // If we're still loading after timeout, update to error state
      if (authState.status === AUTH_STATES.LOADING) {
        console.warn('[Auth] Loading timeout exceeded, forcing state update');
        updateAuthState({
          status: AUTH_STATES.UNAUTHENTICATED,
          error: {
            message: 'Authentication check timed out. Please try again.',
            code: 'TIMEOUT'
          },
          lastAction: 'timeout'
        });
      }
    }, 30000); // 30 seconds timeout
  };

  // Handle successful authentication
  const handleAuthSuccess = useCallback((user, session) => {
    console.log('[Auth] Authentication successful:', { user: user?.email, session: !!session });
    
    // Store user data in localStorage
    if (user) {
      try {
        const userData = {
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata,
          last_authenticated: new Date().toISOString()
        };
        
        const userKey = appConfig?.storage?.userKey || 'trashdrop_user';
        const tokenKey = appConfig?.storage?.tokenKey || 'trashdrop_auth_token';
        localStorage.setItem(userKey, JSON.stringify(userData));
        
        // Store token if session exists
        if (session?.access_token) {
          localStorage.setItem(tokenKey, session.access_token);
        }
      } catch (e) {
        console.error('[Auth] Failed to store user data:', e);
        // This isn't a critical error, so we'll continue with auth success
      }
    }
    
    // Update auth state
    updateAuthState({
      status: AUTH_STATES.AUTHENTICATED,
      user,
      session,
      error: null,
      lastAction: 'sign_in',
      retryCount: 0,
      lastUpdated: new Date().toISOString()
    });
    
    return { success: true, user, session };
  }, [updateAuthState]);

  /**
   * Handle authentication errors
   * @param {Object} error - Error object from Supabase or other auth operations
   * @param {string} action - The action that caused the error
   * @returns {Object} - Success false and error details
   */
  const handleAuthError = useCallback((error, action = 'unknown') => {
    clearLoadingTimeout();
    let errorMessage = 'An error occurred during authentication.';
    let errorCode = 'AUTH_ERROR';
    let errorCategory = ERROR_CATEGORIES.AUTH;
    
    // Extract message and code from error object
    if (error?.message) {
      errorMessage = error.message;
    }
    if (error?.code) {
      errorCode = error.code;
    }
    
    // Categorize common errors for better user feedback
    if (
      error?.message?.includes('JWT') || 
      error?.message?.includes('token') || 
      error?.message?.includes('signature')
    ) {
      errorCode = 'INVALID_TOKEN';
      errorMessage = 'Your authentication token is invalid. Please sign in again.';
    } else if (!navigator.onLine || error?.message?.includes('network')) {
      errorCode = 'NETWORK_ERROR';
      errorMessage = 'A network error occurred. Please check your connection and try again.';
      errorCategory = ERROR_CATEGORIES.NETWORK;
    } else if (error?.message?.includes('rate limit')) {
      errorCode = 'RATE_LIMIT';
      errorMessage = 'Too many authentication attempts. Please wait a moment and try again.';
    }
    
    // Log the error with context
    const context = {
      action,
      errorCode,
      isOnline: navigator.onLine,
      hasLocalToken: !!localStorage.getItem(appConfig?.storage?.tokenKey || 'trashdrop_auth_token'),
      timestamp: new Date().toISOString(),
      retryAfter: errorCode === 'RATE_LIMIT' ? (parseInt(error?.headers?.get('Retry-After')) || 5) : 0
    };
    
    // Log the error using our centralized logger
    logAuthError(error, action, context);
    
    // Update auth state
    updateAuthState({
      status: AUTH_STATES.ERROR,
      error: { message: errorMessage, code: errorCode },
      lastAction: action
    });
    
    // Clear invalid tokens for JWT errors
    if (errorCode === 'INVALID_TOKEN') {
      console.log('[Auth] Clearing auth data due to JWT error');
      clearAuthData();
    }
    
    // If rate limited, schedule a retry
    if (errorCode === 'RATE_LIMIT') {
      const delay = context.retryAfter * 1000;
      console.log(`[Auth] Rate limited, retrying in ${context.retryAfter} seconds...`);
      setTimeout(() => checkSession(true), delay);
    }
    
    return { success: false, error: { message: errorMessage, code: errorCode } };
  }, [clearAuthData, updateAuthState]);

  // Check and refresh the current session
  const checkSession = useCallback(async (force = false) => {
    // First, check for test account before any other logic
    const storedUser = getStoredUser();
    if (storedUser?.email === 'prince02@mailinator.com' && process.env.NODE_ENV === 'development') {
      console.log('[Auth] Test account detected - bypassing session check');
      
      // Ensure mock data mode is enabled for test account
      if (window.appConfig && window.appConfig.features) {
        window.appConfig.features.enableMocks = true;
      }
      
      // Create a persistent test session
      const testUser = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'prince02@mailinator.com',
        user_metadata: { name: 'Test User' },
        last_authenticated: new Date().toISOString()
      };
      
      // Store test user data
      const userKey = 'trashdrop_user'; // Use direct fallback to avoid initialization issues
      localStorage.setItem(userKey, JSON.stringify(testUser));
      
      // Update auth state for test account
      updateAuthState({
        status: AUTH_STATES.AUTHENTICATED,
        user: testUser,
        session: { access_token: 'test_session_token' },
        lastAction: 'test_account_login'
      });
      
      return { 
        success: true, 
        user: testUser,
        isTestAccount: true
      };
    }
    
    // Check for development mode with mocks
    const runtimeConfig = window.appConfig || {};
    const useDevelopmentMocks = runtimeConfig?.features?.enableMocks || false;
    if (useDevelopmentMocks) {
      console.log('[Auth] Development mode with mocks detected in checkSession');
    }
    
    // Prevent multiple concurrent session checks
    if (isCheckingSession.current) {
      console.log('[Auth] Session check already in progress, skipping...');
      return { success: false, error: { message: 'Session check already in progress' } };
    }

    // Skip if already loading and not forcing a refresh
    if (!force && authState.status === AUTH_STATES.LOADING) {
      console.log('[Auth] Already in loading state, skipping...');
      return { success: false, error: { message: 'Already in loading state' } };
    }

    isCheckingSession.current = true;
    console.log('[Auth] Starting session check...');
    
    updateAuthState({ 
      status: AUTH_STATES.LOADING,
      lastAction: 'checking_session',
      error: null
    });
    
    // Start loading timeout to prevent infinite spinner
    startLoadingTimeout();
    
    try {
      // Skip real auth checks if in testing mode
      const isTesting = () => {
        return typeof localStorage !== 'undefined' && 
               localStorage.getItem('trashdrop_testing_mode') === 'true';
      };

      if (isTesting()) {
        console.log('[Auth] Testing mode detected, bypassing JWT validation');
        const storedUser = localStorage.getItem(appConfig?.storage?.userKey || 'trashdrop_user');
        if (storedUser) {
          return handleAuthSuccess(JSON.parse(storedUser), null);
        }
        return { success: false, error: { message: 'No test user found' } };
      }
      
      // First check if the stored token is valid before attempting to use it
      const storedToken = localStorage.getItem(appConfig?.storage?.tokenKey || 'trashdrop_auth_token');
      if (storedToken && !isTokenValid(storedToken)) {
        console.warn('[Auth] Stored token is invalid or malformed, clearing auth data');
        clearAuthData();
      }
      
      // Check if there's any session in localStorage before trying to refresh
      const storageUserKey = appConfig?.storage?.userKey || 'trashdrop_user';
      const storedUser = localStorage.getItem(storageUserKey);
      
      // Skip refresh if no token exists to avoid unnecessary API calls
      if (!storedToken) {
        console.log('[Auth] No token found in localStorage');
        
        // In development, if we have stored user, allow access without token
        if (process.env.NODE_ENV === 'development' && storedUser) {
          console.log('[Auth] Development mode - allowing access without token');
          updateAuthState({
            status: AUTH_STATES.AUTHENTICATED,
            user: storedUser,
            session: { access_token: 'dev_session' },
            lastAction: 'dev_no_token_access',
            error: null
          });
          return { success: true, user: storedUser };
        }
        
        updateAuthState({
          status: AUTH_STATES.UNAUTHENTICATED,
          lastAction: 'session_check',
          user: null,
          session: null,
          error: null
        });
        return { success: false, error: { message: 'No token to refresh' } };
      }
      
      // First try to refresh the session to get a fresh token
      console.log('[Auth] Refreshing session...');
      
      // Add additional error handling for the session refresh
      let refreshResult;
      try {
        refreshResult = await supabase.auth.refreshSession();
      } catch (refreshErr) {
        console.error('[Auth] Unhandled error during session refresh:', refreshErr);
        // Clear any corrupted auth data
        clearAuthData();
        return handleAuthError(refreshErr, 'session_refresh');
      }
      
      const { data: { session }, error: refreshError } = refreshResult;
      
      if (refreshError) {
        console.warn('[Auth] Session refresh failed:', refreshError.message);
        
        // Check for test account first
        const storedUser = getStoredUser();
        if (storedUser && storedUser.email === 'prince02@mailinator.com') {
          console.log('[Auth] Test account detected - preserving session despite refresh error');
          return { success: true }; // Allow continued access
        }
        
        // Check for development mode with mocks
        const runtimeConfig2 = window.appConfig || {};
        const useDevelopmentMocks = runtimeConfig2?.features?.enableMocks || false;
        if (useDevelopmentMocks) {
          console.log('[Auth] Development mode with mocks - preserving session despite refresh error');
          return { success: true }; // Allow continued access
        }
        
        // Handle auth session missing specifically to prevent infinite loading
        if (refreshError.message.includes('Auth session missing')) {
          console.log('[Auth] No existing session to refresh, cleaning up and updating state');
          // Clear any corrupted auth data - but not for test account
          clearAuthData();
          updateAuthState({
            status: AUTH_STATES.UNAUTHENTICATED,
            lastAction: 'session_missing',
            user: null,
            session: null,
            error: null
          });
          return { success: false, error: { message: 'No session to refresh' } };
        }
        
        // If refresh failed with JWT error, reset auth state
        if (refreshError.message.includes('JWT') || 
            refreshError.message.includes('token') || 
            refreshError.message.includes('malformed')) {
          console.log('[Auth] JWT error detected, resetting auth state');
          await resetAuthState({
            message: 'Your session has expired. Please sign in again.',
            code: 'SESSION_EXPIRED'
          });
          return { success: false, error: { message: 'Session expired' } };
        }
        
        // For network errors, try again later or prompt user
        if (!navigator.onLine || 
            refreshError.message.includes('network') || 
            refreshError.message.includes('fetch')) {
          return handleAuthError(refreshError, 'network_error');
        }
        
        // For other errors, just return the error
        return handleAuthError(refreshError, 'refresh_error');
      }
      
      // If we have a valid session, update auth state
      if (session?.user) {
        // Validate the token format before accepting it
        if (session.access_token && !isTokenValid(session.access_token)) {
          console.error('[Auth] Received invalid token format from Supabase');
          return handleAuthError({
            message: 'Invalid token format received',
            code: 'INVALID_TOKEN'
          }, 'token_validation');
        }
        
        console.log('[Auth] Session check successful, user:', session.user.email);
        return handleAuthSuccess(session.user, session);
      }
      
      // No valid session found
      console.log('[Auth] No valid session found, updating state to unauthenticated');
      updateAuthState({
        status: AUTH_STATES.UNAUTHENTICATED,
        lastAction: 'session_check',
        user: null,
        session: null,
        error: null
      });
      return { success: false, error: { message: 'No valid session' } };
      
    } catch (error) {
      console.error('[Auth] Error during session check:', error);
      return handleAuthError(error, 'session_check');
    } finally {
      isCheckingSession.current = false;
      // Make sure to clear any loading timeouts if an error occurs
      clearLoadingTimeout();
    }
  }, [updateAuthState, resetAuthState, handleAuthError, handleAuthSuccess, clearLoadingTimeout]);

  // Authentication methods
  const signIn = useCallback(async (email, password) => {
    console.log('[Auth] Signing in attempt', { email: email || 'no email provided' });
    
    // For debugging - log the credentials being used
    console.log(`[Auth DEBUG] Using credentials: ${email} / ${password ? '******' : 'no password'}`); 
    
    // Regular authentication flow for non-test accounts
    // Set loading state directly
    setAuthState(prev => ({ 
      ...prev, 
      status: AUTH_STATES.LOADING, 
      lastAction: 'signing_in',
      error: null
    }));
    
    try {
      // Log the Supabase URL and key (masked)
      console.log('[Auth DEBUG] Supabase config:', { 
        url: appConfig?.supabase?.url ? 'Set' : 'Not set',
        key: appConfig?.supabase?.anonKey ? 'Set' : 'Not set'
      });
      
      console.log('[Auth DEBUG] Calling signInWithPassword with:', { email });
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      console.log('[Auth DEBUG] Sign-in response:', { 
        hasData: !!data, 
        hasUser: !!data?.user, 
        hasSession: !!data?.session,
        hasError: !!error,
        errorMessage: error?.message
      });
      
      if (error) {
        console.error('[Auth] Sign-in error:', error);
        
        // Set error state directly
        setAuthState({
          status: AUTH_STATES.ERROR,
          user: null,
          error: {
            message: error.message || 'Failed to sign in',
            code: error.code || 'SIGN_IN_ERROR'
          },
          lastAction: 'sign_in_error'
        });
        
        return { 
          success: false, 
          error: { 
            message: error.message || 'Failed to sign in', 
            code: error.code || 'SIGN_IN_ERROR' 
          } 
        };
      }
      
      if (data?.user && data?.session) {
        console.log('[Auth] Sign-in successful:', data.user.email);
        
        // Store user data in localStorage
        try {
          const userData = {
            id: data.user.id,
            email: data.user.email,
            user_metadata: data.user.user_metadata,
            last_authenticated: new Date().toISOString()
          };
          
          const userKey = appConfig?.storage?.userKey || 'trashdrop_user';
          const tokenKey = appConfig?.storage?.tokenKey || 'trashdrop_auth_token';
          localStorage.setItem(userKey, JSON.stringify(userData));
          
          // Store token for quick validation
          if (data.session?.access_token) {
            localStorage.setItem(tokenKey, data.session.access_token);
          }
        } catch (e) {
          console.error('[Auth] Failed to store user data:', e);
        }
        
        // Set authenticated state directly
        setAuthState({
          status: AUTH_STATES.AUTHENTICATED,
          user: data.user,
          session: data.session,
          error: null,
          lastAction: 'sign_in',
          retryCount: 0
        });
        
        return { success: true, user: data.user, session: data.session };
      } else {
        console.error('[Auth] Sign-in response missing user or session data');
        
        setAuthState({
          status: AUTH_STATES.ERROR,
          user: null,
          error: {
            message: 'Invalid response from authentication server',
            code: 'INVALID_RESPONSE'
          },
          lastAction: 'sign_in_error'
        });
        
        return { 
          success: false, 
          error: { 
            message: 'Invalid response from authentication server', 
            code: 'INVALID_RESPONSE' 
          } 
        };
      }
    } catch (error) {
      console.error('[Auth] Unexpected error during sign-in:', error);
      
      setAuthState({
        status: AUTH_STATES.ERROR,
        user: null,
        error: {
          message: error.message || 'An unexpected error occurred during sign-in',
          code: 'UNEXPECTED_ERROR'
        },
        lastAction: 'sign_in_error'
      });
      
      return { 
        success: false, 
        error: { 
          message: error.message || 'An unexpected error occurred during sign-in', 
          code: 'UNEXPECTED_ERROR' 
        } 
      };
    }
  }, []);
  
  const signUp = useCallback(async (email, password, userData) => {
    console.log('[Auth] Signing up:', email);
    updateAuthState({ status: AUTH_STATES.LOADING, lastAction: 'signing_up' });
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData,
          emailRedirectTo: window.location.origin + '/auth/callback',
        },
      });
      
      if (error) {
        console.error('[Auth] Sign up error:', error);
        return handleAuthError(error, 'sign_up');
      }
      
      console.log('[Auth] Sign up successful:', data.user?.email);
      return { success: true, user: data.user, session: data.session };
      
    } catch (error) {
      console.error('[Auth] Unexpected error during sign up:', error);
      return handleAuthError(error, 'sign_up');
    }
  }, [handleAuthError, updateAuthState]);
  
  const signOut = useCallback(async () => {
    console.log('[Auth] Signing out...');
    
    try {
      // First, clear all local data immediately
      clearAuthData();
      
      // Update state to unauthenticated immediately
      setAuthState({
        status: AUTH_STATES.UNAUTHENTICATED,
        user: null,
        session: null,
        error: null,
        lastAction: 'signed_out',
        retryCount: 0
      });
      
      // Then try to sign out from Supabase (non-blocking)
      try {
        await supabase.auth.signOut({ scope: 'global' });
        console.log('[Auth] Supabase sign out successful');
      } catch (supabaseError) {
        console.warn('[Auth] Supabase sign out failed, but local data cleared:', supabaseError);
        // Continue anyway - local data is already cleared
      }
      
      // Clear session storage
      if (typeof window !== 'undefined') {
        sessionStorage.clear();
        sessionStorage.removeItem('trashdrop_last_path');
      }
      
      console.log('[Auth] Sign out complete - user logged out');
      return { success: true };
      
    } catch (error) {
      console.error('[Auth] Unexpected error during sign out:', error);
      // Even if error occurs, ensure we're logged out locally
      setAuthState({
        status: AUTH_STATES.UNAUTHENTICATED,
        user: null,
        session: null,
        error: null,
        lastAction: 'force_signed_out'
      });
      return { success: true }; // Return success since local logout succeeded
    }
  }, [clearAuthData]);

  const resetPassword = useCallback(async (email) => {
    console.log('[Auth] Requesting password reset for:', email);
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password-confirm',
      });
      
      if (error) {
        console.error('[Auth] Password reset error:', error);
        return { 
          success: false, 
          error: error.message || 'Failed to send password reset email' 
        };
      }
      
      console.log('[Auth] Password reset email sent successfully');
      return { success: true };
      
    } catch (error) {
      console.error('[Auth] Unexpected error during password reset:', error);
      return { 
        success: false, 
        error: error.message || 'An unexpected error occurred' 
      };
    }
  }, []);
  
  // Periodic token validation function
  const validateToken = useCallback(async () => {
    // Skip for test accounts
    const storedUser = getStoredUser();
    if (storedUser?.email === 'prince02@mailinator.com' && process.env.NODE_ENV === 'development') {
      return { valid: true };
    }
    
    const storedToken = localStorage.getItem(appConfig?.storage?.tokenKey || 'trashdrop_auth_token');
    if (!storedToken) {
      return { valid: false, reason: 'no_token' };
    }

    try {
      // Basic structure check
      const parts = storedToken.split('.');
      if (parts.length !== 3) {
        return { valid: false, reason: 'invalid_format' };
      }
      
      // Parse the payload
      const payloadBase64 = parts[1];
      let paddedPayload = payloadBase64;
      while (paddedPayload.length % 4 !== 0) {
        paddedPayload += '=';
      }
      
      const payloadStr = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadStr);
      
      // Check expiry
      const currentTime = Math.floor(Date.now() / 1000);
      
      if (payload.exp) {
        // Token is expired
        if (currentTime >= payload.exp) {
          console.warn('[Auth] Token validation: Token has expired');
          return { valid: false, reason: 'expired', expiry: payload.exp };
        }
        
        // Token is near expiry (within 15 minutes)
        const timeToExpiry = payload.exp - currentTime;
        if (timeToExpiry < 15 * 60) {
          console.log(`[Auth] Token validation: Token will expire soon (${timeToExpiry} seconds left)`);
          return { valid: true, nearExpiry: true, expiry: payload.exp };
        }
        
        return { valid: true, expiry: payload.exp };
      } else {
        console.warn('[Auth] Token validation: No expiration found in token');
        return { valid: true, noExpiry: true };
      }
    } catch (error) {
      console.error('[Auth] Token validation error:', error);
      return { valid: false, reason: 'parse_error', error };
    }
  }, []);
  
  // Set up auth on mount
  useEffect(() => {
    console.log('[Auth] Setting up auth context');
    let subscription;
    let refreshInterval;
    let tokenValidationInterval;
    
    const initializeAuth = async () => {
      // Skip if already initialized
      if (isAuthInitialized.current) {
        console.log('[Auth] Auth already initialized, skipping');
        return;
      }
      
      console.log('[Auth useEffect] Initializing authentication...');
      console.log('[Auth useEffect] Current auth state:', {
        status: authState.status,
        hasUser: !!authState.user,
        lastAction: authState.lastAction
      });
      
      // Check if we already have valid user data - don't show loading if we do
      const storedUser = getStoredUser();
      const storedToken = localStorage.getItem(appConfig?.storage?.tokenKey || 'trashdrop_auth_token');
      
      console.log('[Auth useEffect] Checking stored credentials:', {
        hasStoredUser: !!storedUser,
        hasStoredToken: !!storedToken,
        userEmail: storedUser?.email,
        currentStatus: authState.status
      });
      
      // If we have stored user and token, keep current AUTHENTICATED state instead of going to LOADING
      if (!(storedUser && storedToken)) {
        console.log('[Auth useEffect] ❌ No stored credentials, setting LOADING state');
        // Only set loading state if we don't have stored credentials
        updateAuthState({
          status: AUTH_STATES.LOADING,
          lastAction: 'initializing'
        });
      } else {
        console.log('[Auth useEffect] ✅ Found stored credentials, maintaining AUTHENTICATED state during validation');
      }
      
      // In development, allow access with stored user - skip validation
      if (process.env.NODE_ENV === 'development' && storedUser) {
        console.log('[Auth] Development mode - granting access with stored user, skipping validation');
        updateAuthState({
          status: AUTH_STATES.AUTHENTICATED,
          user: storedUser,
          session: { access_token: storedToken || 'dev_token' },
          error: null,
          lastAction: 'init_dev_mode'
        });
        isAuthInitialized.current = true;
        return;
      }
      
      if (!storedToken || !storedToken.includes('.') || storedToken === 'undefined' || storedToken === 'null') {
        console.warn('[Auth] Invalid or missing token, clearing auth data');
        clearAuthData();
        updateAuthState({
          status: AUTH_STATES.UNAUTHENTICATED,
          user: null,
          session: null,
          error: null,
          lastAction: 'init_no_token'
        });
        isAuthInitialized.current = true;
        return;
      }
      
      try {
        // If we have stored user and were recently authenticated, trust it without re-validation
        if (storedUser && storedToken) {
          const lastAuth = storedUser.last_authenticated;
          const timeSinceAuth = lastAuth ? (Date.now() - new Date(lastAuth).getTime()) : Infinity;
          
          // If authenticated within last 24 hours, trust stored credentials
          if (timeSinceAuth < 24 * 60 * 60 * 1000) {
            console.log('[Auth] Recent authentication found, using stored credentials without re-validation');
            updateAuthState({
              status: AUTH_STATES.AUTHENTICATED,
              user: storedUser,
              session: { access_token: storedToken },
              lastAction: 'init_stored_trusted'
            });
            isAuthInitialized.current = true;
            return; // Skip session validation - trust stored credentials
          }
        }
        
        // For old sessions, validate with Supabase
        console.log('[Auth] Old session detected, validating with Supabase...');
        await checkSession();
        
        // Set up auth state change listener
        const { data } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            console.log('[Auth] Auth state changed:', event);
            
            switch (event) {
              case 'SIGNED_IN':
                if (session?.user) {
                  handleAuthSuccess(session.user, session);
                }
                break;
                
              case 'SIGNED_OUT':
                await resetAuthState();
                break;
                
              case 'TOKEN_REFRESHED':
                console.log('[Auth] Token refreshed');
                if (session?.user && authState.status === AUTH_STATES.AUTHENTICATED) {
                  updateAuthState({
                    session,
                    lastAction: 'token_refreshed'
                  });
                  
                  // Store refreshed token
                  if (session.access_token) {
                    localStorage.setItem(appConfig.storage.tokenKey, session.access_token);
                    console.log('[Auth] Stored refreshed token');
                    
                    // Reset the global refresh flag if it was set
                    if (window.trashdropTokenNeedsRefresh) {
                      window.trashdropTokenNeedsRefresh = false;
                    }
                  }
                }
                break;
            }
          }
        );
        
        // Store subscription for cleanup
        subscription = data.subscription;
        
        // Mark auth as initialized
        isAuthInitialized.current = true;
      } catch (error) {
        console.error('[Auth] Error during initialization:', error);
        updateAuthState({
          status: AUTH_STATES.ERROR,
          error: {
            message: 'Failed to initialize authentication',
            original: error
          },
          lastAction: 'init_error'
        });
        // Reset initialization flag on error to allow retry
        isAuthInitialized.current = false;
      }
    };
    
    // Set up periodic session check and token validation
    const setupRefreshIntervals = () => {
      // Clear any existing intervals first
      if (refreshInterval) clearInterval(refreshInterval);
      if (tokenValidationInterval) clearInterval(tokenValidationInterval);
      
      // Set up hourly session refresh for authenticated users
      refreshInterval = setInterval(async () => {
        if (authState.status === AUTH_STATES.AUTHENTICATED) {
          console.log('[Auth] Running scheduled hourly session refresh');
          await checkSession(true);
        }
      }, 60 * 60 * 1000); // Every hour
      
      // Set up token validation every 5 minutes
      tokenValidationInterval = setInterval(async () => {
        if (authState.status === AUTH_STATES.AUTHENTICATED) {
          console.log('[Auth] Running scheduled token validation check');
          const result = await validateToken();
          
          if (!result.valid) {
            console.warn(`[Auth] Token validation failed: ${result.reason}`);
            await checkSession(true); // Force refresh
          } else if (result.nearExpiry) {
            console.log('[Auth] Token near expiry, triggering refresh');
            await checkSession(true); // Force refresh
          }
        }
      }, 5 * 60 * 1000); // Every 5 minutes
    };
    
    // Set up visibility change event listener to refresh session when app becomes visible
    const setupVisibilityListener = () => {
      const handleVisibilityChange = async () => {
        if (document.visibilityState === 'visible' && authState.status === AUTH_STATES.AUTHENTICATED) {
          console.log('[Auth] App became visible, checking session');
          await checkSession();
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    
    // Set up window focus event listener
    const setupFocusListener = () => {
      const handleFocus = async () => {
        if (authState.status === AUTH_STATES.AUTHENTICATED) {
          console.log('[Auth] Window focused, checking session');
          await checkSession();
        }
      };
      
      window.addEventListener('focus', handleFocus);
      return () => window.removeEventListener('focus', handleFocus);
    };
    
    // Set up all listeners and intervals after initialization
    const removeVisibilityListener = setupVisibilityListener();
    const removeFocusListener = setupFocusListener();
    setupRefreshIntervals();
    
    // Call initialization function once
    initializeAuth();
    
    // Cleanup function
    return () => {
      console.log('[Auth] Cleaning up auth context');
      if (subscription) {
        subscription.unsubscribe();
      }
      
      // Clear intervals
      if (refreshInterval) clearInterval(refreshInterval);
      if (tokenValidationInterval) clearInterval(tokenValidationInterval);
      
      // Remove event listeners
      removeVisibilityListener();
      removeFocusListener();
      
      // Reset initialization flag on unmount
      isAuthInitialized.current = false;
    };
  }, []); // Empty dependency array - only run on mount/unmount

  // Context value
  const value = {
    // State
    ...authState,
    isAuthenticated,
    isLoading,
    error,
    status: authState.status, // Explicitly export status for PrivateRoute
    
    // Methods
    signIn,
    signUp,
    signOut,
    resetPassword,
    checkSession,
    resetAuthState,
    clearAuthData,
    updateAuthState,
    handleAuthError,
    handleAuthSuccess
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
