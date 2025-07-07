import { createClient } from '@supabase/supabase-js';

// IMPORTANT: Directly hardcoding Supabase credentials to avoid environment variable issues
// In a production environment, these should be managed through environment variables
const supabaseUrl = 'https://cpeyavpxqcloupolbvyh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwZXlhdnB4cWNsb3Vwb2xidnloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU0OTY4OTYsImV4cCI6MjA2MTA3Mjg5Nn0.5rxsiRuLHCpeJZ5TqoIA5X4UwoAAuxIpNu_reafwwbQ';

console.log('Services - Supabase URL (hardcoded):', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
  signUp: async (email, password, userData = {}) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            ...userData,
            created_at: new Date().toISOString(),
          },
        },
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
  signIn: async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      // Store token in local storage
      localStorage.setItem(appConfig.storage.tokenKey, data.session.access_token);
      localStorage.setItem(appConfig.storage.userKey, JSON.stringify(data.user));
      
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
  signOut: async () => {
    try {
      const { error } = await supabase.auth.signOut();
      
      // Clear local storage
      localStorage.removeItem(appConfig.storage.tokenKey);
      localStorage.removeItem(appConfig.storage.userKey);
      
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
  resetPassword: async (email) => {
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error resetting password:', error.message);
      return { data: null, error };
    }
  },

  /**
   * Get the current authenticated user
   * @returns {Promise} - User object or null
   */
  getCurrentUser: async () => {
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
  getSession: async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      return { session, error: null };
    } catch (error) {
      console.error('Error getting session:', error.message);
      return { session: null, error };
    }
  },
};

export default supabase;
