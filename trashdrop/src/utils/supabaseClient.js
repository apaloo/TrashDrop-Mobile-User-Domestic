import { createClient } from '@supabase/supabase-js';
import appConfig from './app-config.js';
import { supabaseBrowserKeyProblem } from './supabaseKeys.js';
import { getSiteUrl } from './siteUrl.js';
import { endSessionIfNotRemembered } from './rememberMe.js';

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

  // Legacy anon JWT or new publishable key
  const keyProblem = supabaseBrowserKeyProblem(supabaseAnonKey);
  if (keyProblem) {
    const error = new Error(`Invalid Supabase anon key: it ${keyProblem}`);
    console.error('[Supabase] Configuration error:', error.message);
    return { valid: false, error };
  }

  return { valid: true };
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
      const method = (options.method || 'GET').toUpperCase();
      // Reading again is harmless; a write the server failed on is not resent
      const canRetryServerError = method === 'GET' || method === 'HEAD';
      let attempt = 0;
      let lastError;

      while (attempt < maxRetries) {
        attempt++;
        try {
          const response = await fetch(url, options);
          const serverUnavailable = [502, 503, 504].includes(response.status);
          if (serverUnavailable && canRetryServerError && attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            continue;
          }
          // Any other answer, an error status included, goes back to Supabase
          // as it came: thrown, a wrong password read as a network failure
          return response;
        } catch (error) {
          // No answer at all (a dropped connection): try again with a backoff
          lastError = error;
          if (error.name === 'AbortError') break;
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
          }
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
    
    // Suppress expected refresh token errors in development
    const originalConsoleError = console.error;
    console.error = (...args) => {
      const message = args[0];
      if (typeof message === 'string' && 
          (message.includes('refresh_token_not_found') || 
           message.includes('Invalid Refresh Token'))) {
        return; // Suppress these expected errors
      }
      originalConsoleError.apply(console, args);
    };
  }

  // Signed in without "Remember me" and the app was closed since: start signed out
  if (endSessionIfNotRemembered()) console.log('[Supabase] Session not remembered: signed out');

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
  
  // The stored session is left to Supabase, which renews an expired access
  // token (they last an hour) and removes the session only if its server
  // refuses it. Clearing it here on an expired token signed people out
  // whenever they had not opened the app for an hour.
  
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

export {
  clearAuthData
};
export default supabase;
