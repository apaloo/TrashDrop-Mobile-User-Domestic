import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { applyRememberMe } from '../utils/rememberMe.js';
import { connectionProblem, CONNECTION_MESSAGES, withTimeout } from '../utils/connectionProblem.js';
import supabase from '../utils/supabaseClient.js';
import { logAuthError, ERROR_CATEGORIES } from '../utils/errorLogger.js';
import { getSiteUrl } from '../utils/siteUrl.js';
import performanceMonitor from '../utils/performanceMonitor.js';
import appConfigImport from '../utils/app-config.js';
import { clearHouseholdCaches } from '../utils/householdCache.js';

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
// A session check that takes longer keeps the person signed in and moves on
const SESSION_CHECK_TIMEOUT_MS = 8000;

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
  // Auth state - Start with LOADING to validate session first
  const [authState, setAuthState] = useState(() => {
    console.log('[AuthContext] Initialization starting');
    
    // Detect standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        window.navigator.standalone === true;
    
    // Check for stored user during initialization
    const storedUser = getStoredUser();
    const storedToken = localStorage.getItem('trashdrop_auth_token');
    
    // CRITICAL: In standalone mode, start with LOADING state to validate session
    // This prevents auth bypass and white screen issues
    if (isStandalone && storedUser && storedToken && storedToken !== 'undefined' && storedToken !== 'null') {
      console.log('[AuthContext] Standalone mode - found credentials, starting LOADING to validate');
      return {
        status: AUTH_STATES.LOADING,
        user: null,
        error: null,
        retryCount: 0,
        lastAction: 'standalone_init_loading',
        session: null
      };
    }
    
    // Browser mode: Can use stored credentials immediately (faster UX)
    if (!isStandalone && storedUser && storedToken && storedToken !== 'undefined' && storedToken !== 'null') {
      console.log('[AuthContext] Browser mode - found credentials, AUTHENTICATED immediately');
      return {
        status: AUTH_STATES.AUTHENTICATED,
        user: storedUser,
        error: null,
        retryCount: 0,
        lastAction: 'browser_init_authenticated',
        session: { access_token: storedToken }
      };
    }
    
    console.log('[AuthContext] No stored credentials - UNAUTHENTICATED');
    return {
      status: AUTH_STATES.UNAUTHENTICATED,
      user: null,
      error: null,
      retryCount: 0,
      lastAction: 'init_unauthenticated',
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
    // and this household's display caches, so the next person to sign in on
    // this device doesn't see them (shared phones)
    clearHouseholdCaches();
    
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
    // Prevent duplicate authentication for the same user
    if (authState.user?.id === user?.id && authState.status === AUTH_STATES.AUTHENTICATED) {
      // Same person: keep the newer session (Supabase may have just renewed it)
      if (session?.access_token) {
        updateAuthState({ status: AUTH_STATES.AUTHENTICATED, session, error: null, lastAction: 'session_updated' });
        try {
          localStorage.setItem(appConfig?.storage?.tokenKey || 'trashdrop_auth_token', session.access_token);
        } catch (e) { /* storage full or blocked: the session itself is kept by Supabase */ }
      }
      return { success: true, user, session };
    }
    
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    console.log("[Auth] Standalone/PWA mode detection:", isStandalone ? "YES" : "NO");
    if (isStandalone) {
      console.log("[Auth] PWA mode detected - using enhanced storage");
      import("../utils/pwaHelpers.js").then(({ storePwaAuthData }) => {
        storePwaAuthData(user, session, appConfig?.storage?.tokenKey, appConfig?.storage?.userKey);
      });
    }
    console.log('[Auth] Authentication successful:', { hasUser: !!user, session: !!session });
    
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
  }, [updateAuthState, authState.user?.id, authState.status]);

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
    
    // Categorize common errors for better user feedback (connection first:
    // "Failed to fetch" while renewing a token is not a bad token)
    if (connectionProblem(error)) {
      errorCode = 'NETWORK_ERROR';
      errorMessage = 'You are not connected to the internet. Please ensure you are connected to the internet and try again.';
      errorCategory = ERROR_CATEGORIES.NETWORK;
    } else if (
      error?.message?.includes('JWT') || 
      error?.message?.includes('token') || 
      error?.message?.includes('signature')
    ) {
      errorCode = 'INVALID_TOKEN';
      errorMessage = 'Your authentication token is invalid. Please sign in again.';
    } else if (!navigator.onLine || error?.message?.includes('network') || error?.message === 'Failed to fetch' || error?.message?.includes('Failed to fetch')) {
      errorCode = 'NETWORK_ERROR';
      errorMessage = 'You are not connected to the internet. Please ensure you are connected to the internet and try again.';
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
    
    // The stored sign-in is not cleared here: Supabase removes it, and sends
    // SIGNED_OUT, when its server refuses it
    
    // If rate limited, schedule a retry
    if (errorCode === 'RATE_LIMIT') {
      const delay = context.retryAfter * 1000;
      console.log(`[Auth] Rate limited, retrying in ${context.retryAfter} seconds...`);
      setTimeout(() => checkSession(true), delay);
    }
    
    return { success: false, error: { message: errorMessage, code: errorCode } };
  }, [updateAuthState]);

  // The connection failed while checking the session: stay signed in with the
  // user we already know, instead of sending them to the sign-in page
  const keepSignedInDespiteConnection = useCallback((cause) => {
    const knownUser = getStoredUser();
    if (knownUser) {
      updateAuthState({
        status: AUTH_STATES.AUTHENTICATED,
        user: knownUser,
        error: null,
        lastAction: 'kept_signed_in_offline'
      });
      return { success: true, user: knownUser, offline: true };
    }
    updateAuthState({
      status: AUTH_STATES.UNAUTHENTICATED,
      user: null,
      session: null,
      error: null,
      lastAction: 'session_check_offline'
    });
    return { success: false, error: { message: cause?.message || 'Connection problem', code: 'NETWORK_ERROR' } };
  }, [updateAuthState]);

  // Check the current session (Supabase renews it when needed)
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

    // Skip if already authenticated and not forcing (prevent unnecessary refreshes)
    if (!force && authState.status === AUTH_STATES.AUTHENTICATED && authState.user) {
      console.log('[Auth] Already authenticated, skipping session check');
      return { success: true, user: authState.user, session: authState.session };
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
      // Supabase keeps the session in storage and renews it itself, one renewal
      // at a time. getSession() returns the stored session, renewing it first
      // when it has expired. Supabase removes the session (and sends SIGNED_OUT)
      // only when its server refuses it; a dropped connection leaves it in place.
      // So this never clears the sign-in itself: an expired access token (they
      // last an hour) is normal and is renewed, not a reason to sign out.
      const { data, error: sessionError } = await withTimeout(
        supabase.auth.getSession(),
        SESSION_CHECK_TIMEOUT_MS
      );
      const session = data?.session;

      if (session?.user) {
        console.log('[Auth] Session check successful');
        return handleAuthSuccess(session.user, session);
      }

      if (sessionError && connectionProblem(sessionError)) {
        return keepSignedInDespiteConnection(sessionError);
      }

      // No session in storage, or the server refused it (Supabase has removed it)
      if (sessionError) console.warn('[Auth] Session was refused:', sessionError.message);
      updateAuthState({
        status: AUTH_STATES.UNAUTHENTICATED,
        lastAction: 'session_check',
        user: null,
        session: null,
        error: null
      });
      return { success: false, error: { message: 'No valid session' } };
    } catch (error) {
      // A timeout or a dropped request: the stored session is still there and
      // Supabase renews it when the connection is back
      console.warn('[Auth] Session check did not finish:', error?.message);
      return keepSignedInDespiteConnection(error);
    } finally {
      isCheckingSession.current = false;
      clearLoadingTimeout();
    }
  }, [updateAuthState, handleAuthSuccess, keepSignedInDespiteConnection, clearLoadingTimeout]);

  // Authentication methods
  const signIn = useCallback(async (email, password, rememberMe = false) => {
    console.log('[Auth] Signing in attempt', { hasEmail: !!email, rememberMe });
    
    
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
      
      // Before Supabase stores the session: keep it after the app closes, or not
      applyRememberMe(rememberMe, email);
      console.log('[Auth DEBUG] Calling signInWithPassword', { rememberMe });
      // A connection failure comes back as an error, a hang as a timeout, so
      // both reach the connection check below instead of the generic catch
      const attempt = () => withTimeout(supabase.auth.signInWithPassword({ email, password }))
        .catch((attemptError) => {
          if (connectionProblem(attemptError)) return { data: null, error: attemptError };
          throw attemptError;
        });
      // Offline: no point sending it, say so at once. (A dropped request is
      // already retried by the client's fetch, see supabaseClient.js.)
      const { data, error } = connectionProblem(null) === 'offline'
        ? { data: null, error: { name: 'Offline', message: 'Offline' } }
        : await attempt();
      
      console.log('[Auth DEBUG] Sign-in response:', { 
        hasData: !!data, 
        hasUser: !!data?.user, 
        hasSession: !!data?.session,
        hasError: !!error,
        errorMessage: error?.message
      });
      
      if (error) {
        console.error('[Auth] Sign-in error:', error);
        
        // Provide user-friendly error messages for common authentication errors
        let userMessage = error.message || 'Failed to sign in';
        
        const connection = connectionProblem(error);
        if (connection) {
          const failure = {
            ...CONNECTION_MESSAGES[connection],
            code: 'NETWORK_ERROR',
            connection,
            originalMessage: error.message,
          };
          setAuthState({ status: AUTH_STATES.ERROR, user: null, error: failure, lastAction: 'sign_in_error' });
          return { success: false, error: failure };
        } else {
          switch (error.message) {
            case 'Email not confirmed':
              userMessage = 'Please verify your email address before signing in. Check your inbox for a confirmation link.';
              break;
            case 'Invalid login credentials':
              userMessage = 'Invalid email or password. Please check your credentials and try again.';
              break;
            case 'User not found':
              userMessage = 'No account found with this email address.';
              break;
            case 'Email rate limit exceeded':
              userMessage = 'Too many login attempts. Please wait a few minutes and try again.';
              break;
            default:
              // For other errors, try to extract a cleaner message
              if (error.message.includes('email_not_confirmed')) {
                userMessage = 'Please verify your email address before signing in. Check your inbox for a confirmation link.';
              } else if (error.message.includes('invalid')) {
                userMessage = 'Invalid email or password. Please check your credentials and try again.';
              }
          }
        }
        
        // Set error state directly
        setAuthState({
          status: AUTH_STATES.ERROR,
          user: null,
          error: {
            message: userMessage,
            code: error.code || 'SIGN_IN_ERROR',
            originalMessage: error.message
          },
          lastAction: 'sign_in_error'
        });
        
        return { 
          success: false, 
          error: { 
            message: userMessage, 
            code: error.code || 'SIGN_IN_ERROR',
            originalMessage: error.message
          } 
        };
      }
      
      if (data?.user && data?.session) {
        console.log('[Auth] Sign-in successful');
        
        // Store user data in localStorage with remember me preference
        try {
          const userData = {
            id: data.user.id,
            email: data.user.email,
            user_metadata: data.user.user_metadata,
            last_authenticated: new Date().toISOString(),
            remember_me: rememberMe
          };
          
          const userKey = appConfig?.storage?.userKey || 'trashdrop_user';
          const tokenKey = appConfig?.storage?.tokenKey || 'trashdrop_auth_token';
          localStorage.setItem(userKey, JSON.stringify(userData));
          
          // Store token for quick validation
          if (data.session?.access_token) {
            localStorage.setItem(tokenKey, data.session.access_token);
          }
          
          // Set session persistence in Supabase
          if (rememberMe) {
            // For remember me, we want longer session persistence
            await supabase.auth.setSession({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token
            });
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
      
      // Handle network errors in catch block as well
      const errorMessage = error.message || 'An unexpected error occurred during sign-in';
      
      setAuthState({
        status: AUTH_STATES.ERROR,
        user: null,
        error: {
          message: errorMessage,
          code: 'UNEXPECTED_ERROR'
        },
        lastAction: 'sign_in_error'
      });
      
      return { 
        success: false, 
        error: { 
          message: errorMessage, 
          code: 'UNEXPECTED_ERROR' 
        } 
      };
    }
  }, []);
  
  const signUp = useCallback(async (email, password, userData) => {
    console.log('[Auth] Signing up');
    updateAuthState({ status: AUTH_STATES.LOADING, lastAction: 'signing_up' });
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData,
          emailRedirectTo: getSiteUrl() + '/auth/callback',
        },
      });
      
      if (error) {
        console.error('[Auth] Sign up error:', error);
        return handleAuthError(error, 'sign_up');
      }
      
      // With email confirmation on, an address that is already registered comes
      // back as a user with no identities and no error
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        updateAuthState({ status: AUTH_STATES.UNAUTHENTICATED, error: null, lastAction: 'sign_up_existing' });
        return { success: false, error: { message: 'User already registered', code: 'USER_EXISTS' } };
      }

      console.log('[Auth] Sign up successful');
      // Leave the loading state: signed in straight away, or waiting for the
      // user to open the link in the confirmation email
      if (data.session) {
        updateAuthState({ status: AUTH_STATES.AUTHENTICATED, user: data.user, session: data.session, error: null, lastAction: 'sign_up' });
      } else {
        updateAuthState({ status: AUTH_STATES.UNAUTHENTICATED, user: null, session: null, error: null, lastAction: 'sign_up_awaiting_confirmation' });
      }
      return { success: true, user: data.user, session: data.session, needsEmailConfirmation: !data.session };
      
    } catch (error) {
      console.error('[Auth] Unexpected error during sign up:', error);
      return handleAuthError(error, 'sign_up');
    }
  }, [handleAuthError, updateAuthState]);
  
  // Signs out this phone only. { scope: 'global' } signs out every device
  // on the account, { scope: 'others' } every device except this one.
  const signOut = useCallback(async ({ scope = 'local' } = {}) => {
    console.log('[Auth] Signing out...', scope);
    updateAuthState({ status: AUTH_STATES.LOADING, lastAction: 'signing_out' });
    
    try {
      const { error } = await supabase.auth.signOut({ scope });
      if (error) {
        console.error('[Auth] Sign out error:', error);
        // Continue with reset even if sign out fails
      }
      
      // Clear all auth data
      await resetAuthState();
      console.log('[Auth] Sign out successful');
      
      return { success: true };
      
    } catch (error) {
      console.error('[Auth] Unexpected error during sign out:', error);
      // Still try to reset
      await resetAuthState();
      return { success: true }; // Return success so redirect happens
    }
  }, [resetAuthState, updateAuthState]);

  const resetPassword = useCallback(async (email) => {
    console.log('[Auth] Requesting password reset');
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getSiteUrl() + '/reset-password-confirm',
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

  const resendConfirmationEmail = useCallback(async (email) => {
    console.log('[Auth] Resending confirmation email');
    
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          // Same landing page as the first email from signUp
          emailRedirectTo: getSiteUrl() + '/auth/callback'
        }
      });
      
      if (error) {
        console.error('[Auth] Resend confirmation error:', error);
        return { 
          success: false, 
          error: error.message || 'Failed to resend confirmation email' 
        };
      }
      
      console.log('[Auth] Confirmation email resent successfully');
      return { 
        success: true, 
        message: 'Verification email sent! Please check your inbox.' 
      };
      
    } catch (error) {
      console.error('[Auth] Unexpected error during resend confirmation:', error);
      return { 
        success: false, 
        error: error.message || 'An unexpected error occurred' 
      };
    }
  }, []);

  // Social login methods
  const signInWithGoogle = useCallback(async () => {
    console.log('[Auth] Initiating Google OAuth sign in');
    updateAuthState({ status: AUTH_STATES.LOADING, lastAction: 'signing_in_google' });
    
    try {
      applyRememberMe(true);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${getSiteUrl()}/dashboard`,
          // Let people pick their Google account, without asking them to
          // approve TrashDrop again every time (the app never uses Google's
          // offline access)
          queryParams: {
            prompt: 'select_account',
          }
        }
      });
      
      if (error) {
        console.error('[Auth] Google OAuth error:', error);
        return handleAuthError(error, 'google_sign_in');
      }
      
      console.log('[Auth] Google OAuth initiated successfully');
      return { success: true, data };
      
    } catch (error) {
      console.error('[Auth] Unexpected error during Google OAuth:', error);
      return handleAuthError(error, 'google_sign_in');
    }
  }, [handleAuthError, updateAuthState]);

  // Google's own button (utils/googleIdentity.js): Google's ID token goes to
  // Supabase directly, so the Google screen shows TrashDrop, not Supabase
  const signInWithGoogleIdToken = useCallback(async (token, nonce) => {
    console.log('[Auth] Signing in with a Google ID token');
    updateAuthState({ status: AUTH_STATES.LOADING, lastAction: 'signing_in_google' });
    try {
      applyRememberMe(true);
      const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token, nonce });
      if (error) {
        console.error('[Auth] Google ID token sign-in error:', error);
        return handleAuthError(error, 'google_sign_in');
      }
      return { success: true, data };
    } catch (error) {
      console.error('[Auth] Unexpected error during Google ID token sign-in:', error);
      return handleAuthError(error, 'google_sign_in');
    }
  }, [handleAuthError, updateAuthState]);

  const signInWithApple = useCallback(async () => {
    console.log('[Auth] Initiating Apple OAuth sign in');
    updateAuthState({ status: AUTH_STATES.LOADING, lastAction: 'signing_in_apple' });
    
    try {
      applyRememberMe(true);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: `${getSiteUrl()}/dashboard`
        }
      });
      
      if (error) {
        console.error('[Auth] Apple OAuth error:', error);
        return handleAuthError(error, 'apple_sign_in');
      }
      
      console.log('[Auth] Apple OAuth initiated successfully');
      return { success: true, data };
      
    } catch (error) {
      console.error('[Auth] Unexpected error during Apple OAuth:', error);
      return handleAuthError(error, 'apple_sign_in');
    }
  }, [handleAuthError, updateAuthState]);
  
  // Set up auth on mount
  useEffect(() => {
    console.log('[Auth] Setting up auth context');
    let subscription;
    
    const initializeAuth = async () => {
      console.log('[Auth] Initializing auth, current status:', authState.status);
      
      // CRITICAL: If we're in LOADING state (standalone mode with cached credentials),
      // validate the session immediately with GUARANTEED 2-second max timeout
      if (authState.status === AUTH_STATES.LOADING) {
        console.log('[Auth] In LOADING state - validating session now with 2s max timeout');
        
        // Safety timeout - GUARANTEE we exit LOADING state within 2 seconds
        const safetyTimeout = setTimeout(() => {
          console.error('[Auth] SAFETY TIMEOUT: Forcing exit from LOADING state after 2s');
          
          // Try to use cached credentials
          const storedUser = getStoredUser();
          const storedToken = localStorage.getItem('trashdrop_auth_token');
          
          if (storedUser && storedToken) {
            console.log('[Auth] Using cached credentials after safety timeout');
            setAuthState({
              status: AUTH_STATES.AUTHENTICATED,
              user: storedUser,
              session: { access_token: storedToken },
              lastAction: 'safety_timeout_cached',
              error: null,
              retryCount: 0
            });
          } else {
            console.log('[Auth] No cached credentials, forcing UNAUTHENTICATED');
            setAuthState({
              status: AUTH_STATES.UNAUTHENTICATED,
              user: null,
              session: null,
              lastAction: 'safety_timeout_unauthenticated',
              error: null,
              retryCount: 0
            });
          }
        }, 2000);
        
        try {
          // Try to validate session
          await checkSession(true);
          clearTimeout(safetyTimeout);
        } catch (error) {
          console.error('[Auth] Error during session check:', error);
          clearTimeout(safetyTimeout);
          
          // Fall back to cached credentials
          const storedUser = getStoredUser();
          const storedToken = localStorage.getItem('trashdrop_auth_token');
          
          if (storedUser && storedToken) {
            console.log('[Auth] Session check failed, using cached credentials');
            setAuthState({
              status: AUTH_STATES.AUTHENTICATED,
              user: storedUser,
              session: { access_token: storedToken },
              lastAction: 'session_check_failed_cached',
              error: null,
              retryCount: 0
            });
          } else {
            console.log('[Auth] Session check failed, no cached credentials');
            setAuthState({
              status: AUTH_STATES.UNAUTHENTICATED,
              user: null,
              session: null,
              lastAction: 'session_check_failed',
              error: null,
              retryCount: 0
            });
          }
        }
      }
      
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
              if (session?.user) {
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
    
    // No timers or focus checks here: Supabase renews the session itself
    // (autoRefreshToken), including when the app comes back to the screen.
    // Extra renewals here raced it and could get the session revoked.
    
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

  // CRITICAL: Watchdog to prevent infinite LOADING state
  useEffect(() => {
    if (authState.status !== AUTH_STATES.LOADING) return;
    
    console.warn('[Auth] Watchdog: Detected LOADING state, starting 3s max timeout');
    
    const watchdogTimeout = setTimeout(() => {
      console.error('[Auth] WATCHDOG TIMEOUT: Still in LOADING state after 3s, forcing resolution');
      
      // Only force resolution if we haven't already resolved through normal means
      if (authState.status === AUTH_STATES.LOADING) {
        // Force exit from LOADING state
        const storedUser = getStoredUser();
        const storedToken = localStorage.getItem('trashdrop_auth_token');
        
        if (storedUser && storedToken) {
          console.log('[Auth] Watchdog using cached credentials');
          setAuthState({
            status: AUTH_STATES.AUTHENTICATED,
            user: storedUser,
            session: { access_token: storedToken },
            lastAction: 'watchdog_timeout_cached',
            error: null,
            retryCount: 0
          });
        } else {
          console.log('[Auth] Watchdog forcing UNAUTHENTICATED (no cached credentials)');
          setAuthState({
            status: AUTH_STATES.UNAUTHENTICATED,
            user: null,
            session: null,
            lastAction: 'watchdog_timeout_unauthenticated',
            error: null,
            retryCount: 0
          });
        }
      }
    }, 3000); // 3 seconds max in LOADING state
    
    return () => clearTimeout(watchdogTimeout);
  }, [authState.status]);

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
    resendConfirmationEmail,
    signInWithGoogle,
    signInWithGoogleIdToken,
    signInWithApple,
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
