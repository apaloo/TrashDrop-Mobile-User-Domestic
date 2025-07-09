/**
 * Authentication mocking utilities for Cypress tests
 * 
 * This file provides helper functions to mock Supabase authentication
 * consistently across tests and work with the enhanced authentication
 * handling in the application.
 */

// Mock user data - consistent across tests
const TEST_USER = {
  id: 'test-user-id',
  email: 'test@example.com',
  app_metadata: { provider: 'email' },
  user_metadata: { name: 'Test User' }
};

// Mock session data
const TEST_SESSION = {
  access_token: 'fake-jwt-token',
  refresh_token: 'fake-refresh-token',
  expires_in: 3600,
  user: TEST_USER
};

/**
 * Sets up complete authentication mocking for a test
 * This handles all the localStorage items and window stubs
 */
export const mockFullAuth = () => {
  // Set up localStorage tokens in format expected by Supabase auth
  localStorage.setItem('supabase.auth.token', JSON.stringify({
    currentSession: TEST_SESSION,
    expiresAt: Date.now() + 3600000
  }));
  
  // Also store user in app's custom storage key
  localStorage.setItem('trashdrop_user', JSON.stringify(TEST_USER));
  
  // Setup testing flag to bypass JWT validation
  localStorage.setItem('trashdrop_testing_mode', 'true');
};

/**
 * Mocks the Supabase client functions that are used in various components
 * @param {Window} win - Window object from Cypress
 */
export const mockSupabaseClient = (win) => {
  // Create a stub object if it doesn't exist
  if (!win.Cypress) {
    win.Cypress = {};
  }
  
  // Provide mock implementation of Supabase for tests
  win.Cypress.supabase = {
    auth: {
      getSession: () => Promise.resolve({
        data: { session: TEST_SESSION },
        error: null
      }),
      getUser: () => Promise.resolve({
        data: { user: TEST_USER },
        error: null
      }),
      signOut: () => Promise.resolve({
        error: null
      })
    },
    from: (table) => ({
      select: (columns) => ({
        eq: (field, value) => ({
          single: () => {
            // For user stats in bag limitation tests
            if (table === 'user_stats' && field === 'user_id' && value === 'test-user-id') {
              return Promise.resolve({
                data: { user_id: 'test-user-id', total_bags: 3, total_batches: 1 },
                error: null
              });
            }
            
            // For user locations in location tests
            if (table === 'user_locations' && field === 'user_id' && value === 'test-user-id') {
              return Promise.resolve({
                data: [
                  { 
                    id: 'loc1', 
                    user_id: 'test-user-id',
                    name: 'Home',
                    address: '123 Test St',
                    city: 'Test City',
                    latitude: 37.7749,
                    longitude: -122.4194,
                    created_at: '2023-01-01T00:00:00'
                  }
                ],
                error: null
              });
            }
            
            return Promise.resolve({ data: null, error: null });
          },
          then: (callback) => {
            // Support .then() chaining for compatibility with some tests
            return Promise.resolve({
              data: [
                { 
                  id: 'loc1', 
                  user_id: 'test-user-id',
                  name: 'Home',
                  address: '123 Test St',
                  city: 'Test City',
                  latitude: 37.7749,
                  longitude: -122.4194,
                  created_at: '2023-01-01T00:00:00'
                }
              ],
              error: null
            }).then(callback);
          }
        }),
        order: () => ({
          then: (callback) => {
            // Support .then() chaining
            return Promise.resolve({
              data: [
                { 
                  id: 'loc1', 
                  user_id: 'test-user-id',
                  name: 'Home',
                  address: '123 Test St',
                  city: 'Test City',
                  latitude: 37.7749,
                  longitude: -122.4194,
                  created_at: '2023-01-01T00:00:00'
                }
              ],
              error: null
            }).then(callback);
          }
        })
      }),
      upsert: (data) => ({
        then: (callback) => {
          return Promise.resolve({
            data: { ...data, id: 'new-id' },
            error: null
          }).then(callback);
        }
      }),
      delete: () => ({
        eq: () => ({
          then: (callback) => {
            return Promise.resolve({
              data: { success: true },
              error: null
            }).then(callback);
          }
        })
      })
    })
  };
};
