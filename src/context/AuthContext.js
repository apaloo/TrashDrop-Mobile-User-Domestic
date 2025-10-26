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
  // Auth state - SYNCHRONOUS initialization, NO LOADING STATE
  const [authState, setAuthState] = useState(() => {
    console.log('[AuthContext] SYNCHRONOUS initialization starting');
    
    // Check for stored user during initialization
    const storedUser = getStoredUser();
    const storedToken = localStorage.getItem('trashdrop_auth_token');
    
    if (storedUser && storedToken && storedToken !== 'undefined' && storedToken !== 'null') {
      console.log('[AuthContext] Found stored credentials - AUTHENTICATED immediately');
      return {
        status: AUTH_STATES.AUTHENTICATED,
        user: storedUser,
        error: null,
        retryCount: 0,
        lastAction: 'sync_init_authenticated',
        session: { access_token: storedToken }
      };
    }
    
    console.log('[AuthContext] No stored credentials - UNAUTHENTICATED immediately');
    return {
      status: AUTH_STATES.UNAUTHENTICATED,
      user: null,
      error: null,
      retryCount: 0,
      lastAction: 'sync_init_unauthenticated',
      session: null
    };
  });
  
  // Derived state for convenience
  const isAuthenticated = authState.status === AUTH_STATES.AUTHENTICATED;
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
    
    // Set a new timeout (10 seconds for faster recovery)
    loadingTimeoutRef.current = setTimeout(() => {
      // If we're still loading after timeout, update to error state
      setAuthState(prev => {
        if (prev.status === AUTH_STATES.LOADING) {
          console.warn('[Auth] Loading timeout exceeded, forcing state update');
          return {
            ...prev,
            status: AUTH_STATES.UNAUTHENTICATED,
            error: null, // Don't show error, just mark as unauthenticated
            lastAction: 'timeout',
            user: null,
            session: null
          };
        }
        return prev;
      });
    }, 10000); // 10 seconds timeout for faster recovery
  };

  // Handle successful authentication
  const handleAuthSuccess = useCallback((user, session) => {
    console.log('[Auth] Authentication successful:', { user: user?.email, session: !!session });
    
    // Load and apply theme from database IMMEDIATELY after successful authentication
    console.log('[Auth Theme] 🔥 IMMEDIATE THEME CHECK, user:', user);
    console.log('[Auth Theme] 🔥 user?.id:', user?.id);
    if (user?.id) {
      console.log('[Auth Theme] 🎨 Loading theme for authenticated user:', user.id);
      supabase
        .from('profiles')
        .select('dark_mode')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data: profileData, error }) => {
          if (error) {
            console.error('[Auth Theme] ❌ Error loading theme:', error);
            return;
          }
          
          const isDark = profileData?.dark_mode || false;
          console.log('[Auth Theme] 📦 Theme from database:', isDark ? 'DARK' : 'LIGHT', profileData);
          
          // Apply theme globally
          if (isDark) {
            document.documentElement.classList.add('dark');
            document.body.classList.add('dark');
            console.log('[Auth Theme] ✅ DARK MODE APPLIED to documentElement and body');
          } else {
            document.documentElement.classList.remove('dark');
            document.body.classList.remove('dark');
            console.log('[Auth Theme] ✅ LIGHT MODE APPLIED to documentElement and body');
          }
        })
        .catch((error) => {
          console.error('[Auth Theme] ❌ Exception loading theme:', error);
        });
    } else {
      console.log('[Auth Theme] ⚠️ No user ID found, skipping theme load');
    }
    
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
    console.log('[Auth] Starting session check (real authentication only)...');
    
    // Detect standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        window.navigator.standalone === true;
    
    if (isStandalone) {
      console.log('[Auth] PWA Standalone mode detected - using fast authentication path');
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
    
    // Start loading timeout to prevent infinite spinner (shorter timeout in standalone mode)
    if (isStandalone) {
      // CRITICAL: Very short timeout for standalone - 2 seconds to prevent white screen
      loadingTimeoutRef.current = setTimeout(() => {
        setAuthState(prev => {
          if (prev.status === AUTH_STATES.LOADING) {
            console.warn('[Auth] Standalone mode timeout (2s) - using cached credentials or forcing unauthenticated');
            
            // Try to use cached credentials first
            const storedUser = localStorage.getItem('trashdrop_user');
            const storedToken = localStorage.getItem('trashdrop_auth_token');
            
            if (storedUser && storedToken) {
              try {
                const userData = JSON.parse(storedUser);
                console.log('[Auth] Using cached credentials after timeout');
                return {
                  ...prev,
                  status: AUTH_STATES.AUTHENTICATED,
                  user: userData,
                  session: { access_token: storedToken },
                  lastAction: 'standalone_timeout_cached',
                  error: null
                };
              } catch (e) {
                console.error('[Auth] Failed to parse cached user:', e);
              }
            }
            
            // No valid cached credentials, go to login
            return {
              ...prev,
              status: AUTH_STATES.UNAUTHENTICATED,
              error: null,
              lastAction: 'standalone_timeout',
              user: null,
              session: null
            };
          }
          return prev;
        });
        isCheckingSession.current = false;
      }, 2000); // 2 seconds for faster recovery
    } else {
      startLoadingTimeout();
    }
    
    try {
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
        // In standalone mode, add timeout protection to session refresh
        if (isStandalone) {
          const refreshTimeoutDuration = 2000; // 2 seconds in standalone mode
          const refreshTimeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Session refresh timeout in standalone mode')), refreshTimeoutDuration)
          );
          
          refreshResult = await Promise.race([
            supabase.auth.refreshSession(),
            refreshTimeout
          ]);
        } else {
          refreshResult = await supabase.auth.refreshSession();
        }
      } catch (refreshErr) {
        console.error('[Auth] Unhandled error during session refresh:', refreshErr);
        
        // In standalone mode, if refresh fails/times out, try to use stored credentials
        if (isStandalone && storedToken && storedUser) {
          console.warn('[Auth] Standalone mode: Session refresh failed, using stored credentials');
          try {
            const userData = JSON.parse(storedUser);
            updateAuthState({
              status: AUTH_STATES.AUTHENTICATED,
              user: userData,
              session: { access_token: storedToken },
              lastAction: 'standalone_cached_auth',
              error: null
            });
            isCheckingSession.current = false;
            return { success: true, user: userData, session: { access_token: storedToken } };
          } catch (parseErr) {
            console.error('[Auth] Failed to parse stored user:', parseErr);
          }
        }
        
        // Clear any corrupted auth data
        clearAuthData();
        return handleAuthError(refreshErr, 'session_refresh');
      }
      
      const { data: { session }, error: refreshError } = refreshResult;
      
      if (refreshError) {
        console.warn('[Auth] Session refresh failed:', refreshError.message);
        
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
    updateAuthState({ status: AUTH_STATES.LOADING, lastAction: 'signing_out' });
    
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('[Auth] Sign out error:', error);
        return handleAuthError(error, 'sign_out');
      }
      
      // Clear all auth data
      await resetAuthState();
      console.log('[Auth] Sign out successful');
      return { success: true };
      
    } catch (error) {
      console.error('[Auth] Unexpected error during sign out:', error);
      return handleAuthError(error, 'sign_out');
    }
  }, [resetAuthState, handleAuthError, updateAuthState]);

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
    console.log('[Auth] Validating token with Supabase...');
    
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
      // State is already set synchronously in useState - no async init needed
      console.log('[Auth] Auth state already initialized synchronously');
      isAuthInitialized.current = true;
      
      // Set up Supabase auth listener for future sign-ins/sign-outs
      const { data } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('[Auth] Auth state changed:', event);
          
          switch (event) {
            case 'SIGNED_IN':
              if (session?.user) {
                handleAuthSuccess(session.user, session);
              }
              break;
              
            case 'INITIAL_SESSION':
              // This fires when page loads with an existing session
              console.log('[Auth] Initial session detected');
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
                
                if (session.access_token) {
                  localStorage.setItem(appConfig.storage.tokenKey, session.access_token);
                }
              }
              break;
          }
        }
      );
      
      subscription = data.subscription;
      
      // Run background validation for authenticated users (non-blocking)
      if (authState.status === AUTH_STATES.AUTHENTICATED) {
        setTimeout(() => {
          console.log('[Auth] Running background session validation');
          checkSession().catch(err => {
            console.warn('[Auth] Background validation failed:', err);
          });
        }, 2000); // Wait 2 seconds before validating
      }
    };
    
    // Call initialization function once
    initializeAuth();
    
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
