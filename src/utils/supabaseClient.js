import { createClient } from '@supabase/supabase-js';
import appConfig from './app-config';

// Using environment variables for Supabase credentials
const supabaseUrl = appConfig.supabase.url;
const supabaseAnonKey = appConfig.supabase.anonKey;

console.log('Supabase URL:', supabaseUrl);

// Check if we have valid credentials before creating client
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials. Please check your environment variables.');
}

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
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });
    
    console.log('Cleared potentially corrupted authentication data');
  }
};

// Create a custom fetch function to handle schema headers
const customFetch = async (url, options = {}) => {
  const headers = new Headers(options.headers || {});
  
  // Set schema headers for all requests
  headers.set('Accept-Profile', 'public');
  headers.set('Content-Profile', 'public');
  
  // Add other necessary headers
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  
  // Always add schema parameter to the URL
  const urlWithSchema = url.includes('?') 
    ? `${url}&schema=public`
    : `${url}?schema=public`;
  
  // Clone the request to avoid modifying the original
  const request = new Request(urlWithSchema, {
    ...options,
    headers
  });
  
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
};

// Create Supabase client with custom fetch
const createClientOptions = {
  auth: {
    storage: typeof window !== 'undefined' ? window.localStorage : null,
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
  // Use our custom fetch
  fetch: customFetch
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, createClientOptions);

// Helper function to ensure schema is included in table names
export const withSchema = (table) => `public.${table}`;

// Add event listener for auth state changes to detect problems
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth state changed:', event);
  if (event === 'SIGNED_OUT') {
    // Clear any potentially corrupted data on sign out
    clearAuthData();
  }
});

// Check for corrupted token on load and clear if needed
try {
  const hasSession = localStorage.getItem('supabase.auth.token');
  if (hasSession) {
    supabase.auth.getSession().catch(error => {
      if (error.message && (error.message.includes('invalid JWT') || error.message.includes('malformed'))) {
        console.warn('Detected corrupted authentication token, clearing...');
        clearAuthData();
      }
    });
  }
} catch (e) {
  console.error('Error checking auth state:', e);
}

/**
 * Authentication services using Supabase
 */
export const authService = {
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
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      
      // Store token in local storage if appConfig is available
      if (appConfig && appConfig.storage) {
        localStorage.setItem(appConfig.storage.tokenKey, data.session.access_token);
        localStorage.setItem(appConfig.storage.userKey, JSON.stringify(data.user));
      }
      
      return { data, error: null };
    } catch (error) {
      console.error('Error signing in:', error.message);
      return { data: null, error };
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

export default supabase;
