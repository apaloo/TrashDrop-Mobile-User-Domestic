import { createClient } from '@supabase/supabase-js';
import appConfig from './app-config.js';

// Import environment variables directly to avoid circular dependency or initialization timing issues
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Log configuration status for debugging
const logConfigStatus = () => {
  console.log('[Supabase] Initializing client with config:', {
    url: supabaseUrl ? '✓ URL is set' : '✗ URL is missing',
    anonKey: supabaseAnonKey ? '✓ Anon key is set' : '✗ Anon key is missing',
    env: process.env.NODE_ENV
  });
};

// Validate credentials before creating client
const validateCredentials = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error('Missing Supabase credentials. Please check your environment variables.');
    console.error('[Supabase] Configuration error:', error.message);
    return { valid: false, error };
  }

  // Additional validation for URL format
  try {
    new URL(supabaseUrl);
  } catch (e) {
    const error = new Error(`Invalid Supabase URL: ${supabaseUrl}`);
    console.error('[Supabase] Configuration error:', error.message);
    return { valid: false, error };
  }

  // Basic JWT validation
  if (!supabaseAnonKey.startsWith('eyJ')) {
    const error = new Error('Invalid Supabase anon key format. Expected JWT token.');
    console.error('[Supabase] Configuration error:', error.message);
    return { valid: false, error };
  }

  return { valid: true };
};

/**
 * Validates if a string is a properly formatted JWT token
 * @param {string} token - The token to validate
 * @returns {boolean} - Whether the token is valid
 */
const isTokenValid = (token) => {
  if (!token || typeof token !== 'string') {
    console.warn('[Supabase] Token validation failed: Token is not a string');
    return false;
  }
  
  // Log token length for debugging (without exposing token content)
  console.log(`[Supabase] Validating token of length ${token.length}, first 4 chars: ${token.substring(0, 4)}...`);

  // Basic structure check (three parts separated by dots)
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.warn(`[Supabase] Token validation failed: Token has ${parts.length} parts instead of 3`);
    return false;
  }

  // Check if each part is valid base64url
  const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
  for (let i = 0; i < parts.length; i++) {
    if (!base64UrlRegex.test(parts[i])) {
      console.warn(`[Supabase] Token validation failed: Part ${i+1} contains invalid characters`);
      return false;
    }
  }

  // Try to decode header and payload to check format
  // Safer base64 decoding with proper padding
  const decodeBase64 = (str) => {
    // Add padding if needed
    let paddedStr = str;
    while (paddedStr.length % 4 !== 0) {
      paddedStr += '=';
    }
    // Replace URL-safe chars with standard base64 chars
    paddedStr = paddedStr.replace(/-/g, '+').replace(/_/g, '/');
    try {
      return atob(paddedStr);
    } catch (e) {
      console.warn(`[Supabase] Base64 decode error: ${e.message}`);
      return '';
    }
  };
  
  const headerStr = decodeBase64(parts[0]);
  const payloadStr = decodeBase64(parts[1]);
  
  if (!headerStr || !payloadStr) {
    console.warn('[Supabase] Token validation failed: Could not decode token parts');
    return false;
  }
  
  try {
    const header = JSON.parse(headerStr);
    const payload = JSON.parse(payloadStr);
    
    // Basic header checks
    if (!header.alg || !header.typ) {
      console.warn('[Supabase] Token validation failed: Header missing required fields');
      return false;
    }
    
    // Check if token is expired
    if (payload.exp) {
      const expiryTime = payload.exp * 1000;
      const currentTime = Date.now();
      const timeToExpiry = expiryTime - currentTime;
      
      // If token is already expired
      if (currentTime >= expiryTime) {
        console.warn('[Supabase] Token validation failed: Token is expired');
        return false;
      }
      
      // Aggressive refresh strategy (refresh when less than 60 minutes left)
      if (timeToExpiry < 60 * 60 * 1000) {
        console.log('[Supabase] Token will expire in ' + Math.floor(timeToExpiry / 60000) + ' minutes, triggering refresh');
        
        // Set a global flag to notify that token needs refresh
        window.trashdropTokenNeedsRefresh = true;
        
        // Schedule token refresh (don't await to avoid blocking)
        setTimeout(() => {
          try {
            supabase.auth.refreshSession();
            console.log('[Supabase] Session refresh triggered');
          } catch (e) {
            console.error('[Supabase] Failed to refresh session:', e);
          }
        }, 0);
        
        // Still return true to allow current operation to continue while refresh happens in background
        return true;
      }
    }
    
    return true;
  } catch (e) {
    console.warn('[Supabase] Token validation failed: Could not decode token', e);
    return false;
  }
};

// Function to clear potentially corrupted auth data
const clearAuthData = () => {
  if (typeof localStorage !== 'undefined') {
    // Clear only Supabase auth related items
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('supabase') || key.includes('sb-'))) {
        keysToRemove.push(key);
      }
    }
    
    // Also clear app-specific auth tokens
    if (appConfig.storage?.tokenKey) {
      keysToRemove.push(appConfig.storage.tokenKey);
    }
    if (appConfig.storage?.userKey) {
      keysToRemove.push(appConfig.storage.userKey);
    }
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`[Supabase] Removed from localStorage: ${key}`);
    });
    
    console.log('[Supabase] Cleared potentially corrupted authentication data');
  }
};

// Check if Supabase URL is reachable with proper error reporting
const checkSupabaseConnection = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout - increased for slow connections
    
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (response.status >= 400 && response.status < 500) {
      console.warn(`[Supabase] Connection check: Auth issue (${response.status}). Check your anon key.`);
    }
    
    return response.status < 500; // Consider 4xx as reachable but unauthorized
  } catch (error) {
    console.error('[Supabase] Connection check failed:', error.name, error.message);
    return false;
  }
};

// Create a custom fetch implementation with retry logic
const createCustomFetch = () => {
  return async (url, options = {}) => {
    // Check for test user in dev mode
    const isTestUser = process.env.NODE_ENV === 'development' && 
      options.headers?.['Authorization']?.includes('123e4567-e89b-12d3-a456-426614174000');

    if (isTestUser) {
      // Return mock data for test user
      console.log('[Dev] Using mock response for test user request:', url);
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          data: [],
          error: null
        }),
        text: async () => '{}'
      };
      return mockResponse;
    }

    const timeoutMs = 30000; // 30 second timeout - increased for slow connections
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      // Add signal to options
      options.signal = controller.signal;
      
      // Log request in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Supabase] Request ${options.method || 'GET'} ${url}`, {
          headers: options.headers,
          body: options.body,
        });
      }
      
      const maxRetries = 3;
      let attempt = 0;
      let lastError;

      while (attempt < maxRetries) {
        try {
          const response = await fetch(url, options);
          
          // Check if the response is ok (status in the range 200-299)
          if (!response.ok) {
            const error = new Error(`HTTP ${response.status}: ${await response.text()}`);
            error.status = response.status;
            throw error;
          }
          
          return response;
        } catch (error) {
          lastError = error;
          attempt++;
          
          // Only retry on network errors or 5xx server errors
          if (!error.status || error.status >= 500) {
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            continue;
          }
          
          // Don't retry on client errors (4xx)
          break;
        }
      }
      
      // Log the error for debugging
      console.warn('[Supabase] Fetch failed:', lastError);
      throw lastError;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - please check your internet connection');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };
};

// Initialize Supabase client
const initSupabase = () => {
  logConfigStatus();
  
  const { valid, error } = validateCredentials();
  if (!valid) {
    console.error('[Supabase] Failed to initialize due to configuration error:', error);
    throw error;
  }

  console.log('[Supabase] Credentials validated successfully');
  
  const customFetch = createCustomFetch();

  const clientOptions = {
    auth: {
      storage: window.localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    },
    global: {
      fetch: customFetch
    }
  };

  if (process.env.NODE_ENV === 'development') {
    clientOptions.realtime = {
      params: {
        eventsPerSecond: 1
      },
      logger: (level, message, extras) => {
        if (message?.includes('WebSocket') && message?.includes('failed')) {
          return; // Suppress WebSocket connection errors
        }
        if (level === 'error' || level === 'warn') {
          console[level]('[Supabase Realtime]', message, extras);
        }
      }
    };
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, clientOptions);

  console.log('[Supabase] Client initialized successfully');

  return client;
  return createClient(supabaseUrl, supabaseAnonKey, clientOptions);
};

// Create and export the Supabase client
let supabase;

try {
  supabase = initSupabase();
  
  // Add auth state change listener
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('[Supabase] Auth state changed:', event);
    
    if (event === 'SIGNED_OUT') {
      // Clear any potentially corrupted data on sign out
      clearAuthData();
    }
  });
  
  // Check for corrupted token on load
  const checkSession = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        // Check if token is corrupted
        const token = localStorage.getItem(appConfig.storage.tokenKey);
        if (token) {
          console.log('[Supabase] Found token, checking validity...');
          if (!isTokenValid(token)) {
            console.warn('[Supabase] Found invalid or corrupted token, clearing auth data');
            clearAuthData();
          } else {
            console.log('[Supabase] Token format validation passed');
            // Token will still be verified with Supabase on refresh
          }
        }
      }
    } catch (error) {
      console.error('[Supabase] Error checking session:', error);
      clearAuthData(); // Clear on any error to be safe
    }
  };
  
  checkSession();
  
} catch (error) {
  console.error('[Supabase] Failed to initialize client:', error);
  
  // Create proper error reporting client that doesn't use fallbacks
  console.error('[Supabase] Client initialization failed - application requires Supabase connection');
  
  // Instead of a fallback, create a clean error reporting client
  supabase = {
    auth: {
      signInWithPassword: () => Promise.reject(new Error('Unable to connect to authentication service. Please check your internet connection and try again.')),
      signUp: () => Promise.reject(new Error('Unable to connect to authentication service. Please check your internet connection and try again.')),
      signOut: () => Promise.reject(new Error('Unable to connect to authentication service')),
      onAuthStateChange: (callback) => {
        // Notify of disconnection immediately
        callback('SIGNED_OUT', null);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      getSession: () => Promise.resolve({ data: { session: null }, error: new Error('Authentication service unavailable') })
    },
    from: (table) => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.reject(new Error(`Unable to access ${table}. Database connection unavailable`))
        })
      })
    })
  };
}

// Export the initialized client
export { supabase };

// Helper function to ensure schema is included in table names
export const withSchema = (table) => `public.${table}`;

/**
 * Authentication services using Supabase
 */
const authService = {
  /**
   * Sign up a new user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {Object} userData - Additional user data
   * @returns {Promise} - Supabase auth response
   */
  async signUp(email, password, userData = {}) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData
        }
      });
      
      if (error) throw error;
      
      return { data, error: null };
    } catch (error) {
      console.error('Error signing up:', error.message);
      return { data: null, error };
    }
  },
  
  /**
   * Sign in a user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise} - Supabase auth response
   */
  async signIn(email, password) {
    console.log('[Auth] Attempting sign in for:', email);
    
    // Validate email and password
    if (!email || !password) {
      const error = new Error('Email and password are required');
      console.error('[Auth] Validation error:', error.message);
      return { data: null, error };
    }

    try {
      console.log('[Auth] Calling Supabase signInWithPassword');
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim()
      });
      
      if (error) {
        console.error('[Auth] Supabase sign-in error:', {
          message: error.message,
          status: error.status,
          name: error.name
        });
        
        // Handle specific error cases
        if (error.message.includes('Invalid login credentials')) {
          error.userMessage = 'Invalid email or password';
        } else if (error.message.includes('Email not confirmed')) {
          error.userMessage = 'Please verify your email before signing in';
        } else if (error.message.includes('Invalid API key')) {
          error.userMessage = 'Configuration error. Please contact support.';
          // Log additional debug info
          console.error('[Auth] Invalid API key detected. Current config:', {
            url: supabaseUrl,
            anonKey: supabaseAnonKey ? '***' + supabaseAnonKey.slice(-4) : 'undefined',
            env: process.env.NODE_ENV
          });
        }
        
        throw error;
      }
      
      console.log('[Auth] Sign in successful for user:', data.user?.email);
      
      // Store token in local storage if appConfig is available
      if (appConfig?.storage) {
        try {
          if (data?.session?.access_token) {
            localStorage.setItem(appConfig.storage.tokenKey, data.session.access_token);
            console.log('[Auth] Stored access token in localStorage');
          }
          if (data?.user) {
            localStorage.setItem(appConfig.storage.userKey, JSON.stringify(data.user));
            console.log('[Auth] Stored user data in localStorage');
          }
        } catch (storageError) {
          console.error('[Auth] Error storing auth data:', storageError);
          // Don't fail the sign-in if storage fails
        }
      }
      
      return { data, error: null };
      
    } catch (error) {
      console.error('[Auth] Error in signIn:', {
        message: error.message,
        stack: error.stack,
        originalError: error
      });
      
      // Ensure we always return a consistent error object
      return { 
        data: null, 
        error: {
          message: error.userMessage || 'An error occurred during sign in',
          originalError: error.message,
          code: error.status || 'AUTH_ERROR'
        }
      };
    }
  },
  
  /**
   * Sign out the current user
   * @returns {Promise} - Supabase auth response
   */
  async signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      
      // Clear local storage tokens if appConfig is available
      if (appConfig && appConfig.storage) {
        localStorage.removeItem(appConfig.storage.tokenKey);
        localStorage.removeItem(appConfig.storage.userKey);
      }
      
      // Also run clearAuthData to ensure all Supabase tokens are removed
      clearAuthData();
      
      if (error) throw error;
      
      return { error: null };
    } catch (error) {
      console.error('Error signing out:', error.message);
      return { error };
    }
  },
  
  /**
   * Reset password for a user
   * @param {string} email - User email
   * @returns {Promise} - Supabase auth response
   */
  async resetPassword(email) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      
      if (error) throw error;
      
      return { error: null };
    } catch (error) {
      console.error('Error resetting password:', error.message);
      return { error };
    }
  },
  
  /**
   * Get the current authenticated user
   * @returns {Promise} - User object or null
   */
  async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) throw error;
      
      return { user, error: null };
    } catch (error) {
      console.error('Error getting current user:', error.message);
      return { user: null, error };
    }
  },
  
  /**
   * Get the current session
   * @returns {Promise} - Session object or null
   */
  async getSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) throw error;
      
      return { session, error: null };
    } catch (error) {
      console.error('Error getting session:', error.message);
      return { session: null, error };
    }
  }
};

export { authService, isTokenValid, clearAuthData };
export default supabase;
