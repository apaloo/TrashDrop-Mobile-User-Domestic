import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import supabase, { isTokenValid, clearAuthData, getCurrentUser } from '../utils/supabaseClient.js';
import appConfig from '../utils/app-config.js';
import { logAuthError, ERROR_CATEGORIES } from '../utils/errorLogger.js';

/**
 * Get the stored user from localStorage
 * @returns {Object|null} The user object or null if not found
 */
const getStoredUser = () => {
  try {
    if (typeof localStorage === 'undefined') return null;
    
    const storedUser = localStorage.getItem(appConfig.storage.userKey);
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
  // Auth state
  const [authState, setAuthState] = useState({
    status: AUTH_STATES.INITIAL,
    user: null,
    error: null,
    retryCount: 0,
    lastAction: null,
    session: null
  });
  
  // Derived state for convenience
  const isAuthenticated = authState.status === AUTH_STATES.AUTHENTICATED;
  const isLoading = authState.status === AUTH_STATES.LOADING;
  const error = authState.error;
  
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
      appConfig.storage.userKey,
      appConfig.storage.tokenKey
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
    updateAuthState(prev => ({
      status: error ? AUTH_STATES.ERROR : AUTH_STATES.UNAUTHENTICATED,
      user: null,
      session: null,
      error: error || null,
      lastAction: 'reset',
      retryCount: 0,
      lastUpdated: new Date().toISOString(),
      previousState: prev.status === AUTH_STATES.AUTHENTICATED ? 'was_authenticated' : 'was_unauthenticated'
    }));
    
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
  }, [clearAuthData, updateAuthState]);
  
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
        
        localStorage.setItem(appConfig.storage.userKey, JSON.stringify(userData));
        
        // Also store the session token if available
        if (session?.access_token) {
          localStorage.setItem(appConfig.storage.tokenKey, session.access_token);
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
      hasLocalToken: !!localStorage.getItem(appConfig.storage.tokenKey),
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
        id: '12345678-1234-5678-1234-567812345678',
        email: 'prince02@mailinator.com',
        user_metadata: { name: 'Test User' },
        last_authenticated: new Date().toISOString()
      };
      
      // Store test user data
      localStorage.setItem(appConfig.storage.userKey, JSON.stringify(testUser));
      
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
    const appConfig = window.appConfig || {};
    const useDevelopmentMocks = appConfig.features && appConfig.features.enableMocks;
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
        const storedUser = localStorage.getItem(appConfig.storage.userKey);
        if (storedUser) {
          return handleAuthSuccess(JSON.parse(storedUser), null);
        }
        return { success: false, error: { message: 'No test user found' } };
      }
      
      // First check if the stored token is valid before attempting to use it
      const storedToken = localStorage.getItem(appConfig.storage.tokenKey);
      if (storedToken && !isTokenValid(storedToken)) {
        console.warn('[Auth] Stored token is invalid or malformed, clearing auth data');
        clearAuthData();
      }
      
      // Check if there's any session in localStorage before trying to refresh
      const storedUser = localStorage.getItem(appConfig.storage.userKey);
      
      // Skip refresh if no token exists to avoid unnecessary API calls
      if (!storedToken) {
        console.log('[Auth] No token found in localStorage, skipping refresh');
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
        const appConfig = window.appConfig || {};
        const useDevelopmentMocks = appConfig.features && appConfig.features.enableMocks;
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
    
    // SPECIAL CASE: Use the hardcoded credentials for testing purposes
    // This will allow us to test the app without needing a working Supabase connection
    if (email === 'prince02@mailinator.com' && password === 'sChool@123') {
      console.log('[Auth] Using special test account credentials');
      
      // Create a mock user and session for the test account
      const mockUser = {
        id: '12345678-1234-5678-1234-567812345678', // Valid UUID format
        email: email,
        user_metadata: {
          first_name: 'Prince',
          last_name: 'Test',
        },
        app_metadata: {
          role: 'authenticated'
        },
        aud: 'authenticated'
      };
      
      // Create a properly structured JWT mock token with three parts
      // This follows the format: header.payload.signature
      const createMockJwt = () => {
        // Create base64 encoded header
        const header = btoa(JSON.stringify({
          alg: 'HS256',
          typ: 'JWT'
        })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        
        // Create base64 encoded payload with standard JWT claims
        const payload = btoa(JSON.stringify({
          sub: mockUser.id,
          email: mockUser.email,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          aud: 'authenticated',
          role: 'authenticated'
        })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        
        // Mock signature (not actually verifiable, but correctly formatted)
        const signature = 'mockSignatureForTestingPurposesOnly123456789';
        
        return `${header}.${payload}.${signature}`;
      };

      const mockSession = {
        access_token: createMockJwt(),
        refresh_token: createMockJwt(), // Use the same structure for refresh token
        expires_in: 3600,
        user: mockUser
      };
      
      try {
        // Store user data in localStorage for persistence
        localStorage.setItem(appConfig.storage.userKey, JSON.stringify(mockUser));
        localStorage.setItem(appConfig.storage.tokenKey, mockSession.access_token);
        
        // Update auth state to authenticated
        setAuthState({
          status: AUTH_STATES.AUTHENTICATED,
          user: mockUser,
          session: mockSession,
          error: null,
          lastAction: 'sign_in',
          retryCount: 0
        });
        
        return { success: true, user: mockUser, session: mockSession };
      } catch (e) {
        console.error('[Auth] Error setting up test account:', e);
      }
    }
    
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
        url: appConfig.supabase?.url ? 'Set' : 'Not set',
        key: appConfig.supabase?.anonKey ? 'Set' : 'Not set'
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
          
          localStorage.setItem(appConfig.storage.userKey, JSON.stringify(userData));
          
          // Also store the session token if available
          if (data.session?.access_token) {
            localStorage.setItem(appConfig.storage.tokenKey, data.session.access_token);
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
  
  // Set up auth on mount
  useEffect(() => {
    console.log('[Auth] Setting up auth context');
    let subscription;
    
    const initializeAuth = async () => {
      // Skip if already initialized
      if (isAuthInitialized.current) {
        console.log('[Auth] Auth already initialized, skipping');
        return;
      }
      
      console.log('[Auth] Initializing authentication...');
      isAuthInitialized.current = true;
      
      // Clear any potentially corrupted tokens first
      const storedToken = localStorage.getItem(appConfig.storage.tokenKey);
      if (storedToken && !storedToken.includes('.') || storedToken === 'undefined' || storedToken === 'null') {
        console.warn('[Auth] Found corrupted token, clearing auth data');
        clearAuthData();
      }
      
      try {
        // First, check if we have a stored token in localStorage
        const hasStoredToken = localStorage.getItem(appConfig.storage.tokenKey);
        
        if (!hasStoredToken) {
          console.log('[Auth] No stored token found, skipping session check');
          // If no token exists, just set state to unauthenticated and skip session check
          updateAuthState({
            status: AUTH_STATES.UNAUTHENTICATED,
            user: null,
            session: null,
            error: null,
            lastAction: 'init',
            retryCount: 0
          });
        } else {
          console.log('[Auth] Stored token found, checking session...');
          // Only check session if we have a stored token
          await checkSession();
        }
        
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
                }
                break;
                
              case 'USER_UPDATED':
                console.log('[Auth] User updated:', session?.user);
                if (session?.user) {
                  updateAuthState({
                    user: session.user,
                    session,
                    lastAction: 'user_updated'
                  });
                }
                break;
                
              case 'PASSWORD_RECOVERY':
                console.log('[Auth] Password recovery requested');
                // Handle password recovery
                break;
                
              default:
                console.log('[Auth] Unhandled auth state change:', event);
            }
          }
        );
        
        subscription = data.subscription;
        
      } catch (error) {
        console.error('[Auth] Error during auth initialization:', error);
        // Ensure we're in a defined state even if initialization fails
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
    
    // Call initialization function once
    initializeAuth();
    
    // Cleanup function
    return () => {
      console.log('[Auth] Cleaning up auth context');
      if (subscription) {
        subscription.unsubscribe();
      }
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
    
    // Methods
    signIn,
    signUp,
    signOut,
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
