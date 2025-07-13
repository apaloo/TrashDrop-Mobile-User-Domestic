import { createClient } from '@supabase/supabase-js';
import appConfig from './app-config.js';

// Using environment variables for Supabase credentials
const supabaseUrl = appConfig.supabase?.url;
const supabaseAnonKey = appConfig.supabase?.anonKey;

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
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      console.warn('[Supabase] Token validation failed: Token is expired');
      return false;
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

// Create a custom fetch implementation with retry logic
const createCustomFetch = () => {
  return async (url, options = {}) => {
    const retries = 3;
    const retryDelay = 1000; // 1 second
    
    // Add Supabase headers
    const headers = {
      ...options.headers,
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    let lastError;
    
    for (let i = 0; i < retries; i++) {
      try {
        // Log request in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Supabase] ${options.method || 'GET'} ${url}`, {
            headers: { ...headers, 'apikey': '***', 'Authorization': 'Bearer ***' },
            body: options.body ? JSON.parse(options.body) : undefined,
          });
        }

        const response = await fetch(url, { ...options, headers });
        
        // Log response in development
        if (process.env.NODE_ENV === 'development') {
          const responseClone = response.clone();
          const responseText = await responseClone.text();
          let responseData;
          try {
            responseData = JSON.parse(responseText);
          } catch (e) {
            responseData = responseText;
          }
          
          console.log(`[Supabase] Response ${response.status} ${response.statusText}`, {
            url,
            status: response.status,
            statusText: response.statusText,
            attempt: `${i + 1}/${retries}`,
            body: responseData,
          });
        }

        return response;
      } catch (error) {
        lastError = error;
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)));
        }
      }
    }
    
    throw lastError || new Error('Failed to fetch after multiple retries');
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
  
  const clientOptions = {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'sb-auth-token',
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'X-Client-Info': 'trashdrop-web/1.0',
      },
    },
    fetch: createCustomFetch()
  };

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
  
  // Create a mock client in development to prevent app crashes
  if (process.env.NODE_ENV === 'development') {
    console.warn('[Supabase] Creating mock client for development');
    supabase = {
      auth: {
        signIn: () => Promise.reject(new Error('Supabase client not initialized')),
        signUp: () => Promise.reject(new Error('Supabase client not initialized')),
        signOut: () => Promise.reject(new Error('Supabase client not initialized')),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        getSession: () => Promise.resolve({ data: { session: null }, error: new Error('Supabase client not initialized') })
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: new Error('Supabase client not initialized') })
          })
        })
      })
    };
  } else {
    throw error;
  }
}

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
