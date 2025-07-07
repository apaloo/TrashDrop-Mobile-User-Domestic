/**
 * Auth Testing Utility
 * This file exports functions that can be exposed to the window object
 * for testing authentication flows directly in the browser console.
 */

import { authService } from './supabaseClient';

// Test user credentials
const testUser = {
  email: 'test@trashdrop.com',
  password: 'Password123!',
  userData: { full_name: 'Test User' }
};

// Test registration
const testSignUp = async () => {
  console.log('📝 Testing registration...');
  try {
    const { data, error } = await authService.signUp(
      testUser.email,
      testUser.password,
      testUser.userData
    );
    
    if (error) {
      console.error('❌ Registration failed:', error.message);
      return { success: false, error: error.message };
    }
    
    console.log('✅ Registration successful!', data);
    return { success: true, data };
  } catch (err) {
    console.error('❌ Registration exception:', err.message);
    return { success: false, error: err.message };
  }
};

// Test login
const testSignIn = async () => {
  console.log('🔑 Testing login...');
  try {
    const { data, error } = await authService.signIn(
      testUser.email,
      testUser.password
    );
    
    if (error) {
      console.error('❌ Login failed:', error.message);
      return { success: false, error: error.message };
    }
    
    console.log('✅ Login successful!', data);
    return { success: true, data };
  } catch (err) {
    console.error('❌ Login exception:', err.message);
    return { success: false, error: err.message };
  }
};

// Test get current user
const testGetCurrentUser = async () => {
  console.log('👤 Testing get current user...');
  try {
    const { user, error } = await authService.getCurrentUser();
    
    if (error) {
      console.error('❌ Get user failed:', error.message);
      return { success: false, error: error.message };
    }
    
    console.log('✅ User retrieved:', user);
    return { success: true, user };
  } catch (err) {
    console.error('❌ Get user exception:', err.message);
    return { success: false, error: err.message };
  }
};

// Test sign out
const testSignOut = async () => {
  console.log('🚪 Testing sign out...');
  try {
    const { error } = await authService.signOut();
    
    if (error) {
      console.error('❌ Sign out failed:', error.message);
      return { success: false, error: error.message };
    }
    
    console.log('✅ Sign out successful!');
    return { success: true };
  } catch (err) {
    console.error('❌ Sign out exception:', err.message);
    return { success: false, error: err.message };
  }
};

// Expose test methods to window for browser console testing
const exposeToWindow = () => {
  if (typeof window !== 'undefined') {
    window.authTester = {
      testSignUp,
      testSignIn,
      testGetCurrentUser,
      testSignOut,
      runAllTests: async () => {
        console.log('🧪 Running all authentication tests...');
        console.log('-------------------------------------');
        await testSignUp();
        await testSignIn();
        await testGetCurrentUser();
        await testSignOut();
        console.log('-------------------------------------');
        console.log('🏁 All tests completed');
      }
    };
    console.log('🔍 Auth Tester exposed to window.authTester');
  }
};

export {
  testSignUp,
  testSignIn,
  testGetCurrentUser,
  testSignOut,
  exposeToWindow
};

// Auto-expose when imported in development
if (process.env.NODE_ENV === 'development') {
  exposeToWindow();
}
