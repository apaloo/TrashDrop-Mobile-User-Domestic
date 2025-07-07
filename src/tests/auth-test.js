// Authentication Flow Test Script
// This script can be run to test Supabase authentication integration

import { supabase, authService } from '../utils/supabaseClient';

// Test credentials - DO NOT use real credentials
const TEST_EMAIL = 'test@trashdrop.com';
const TEST_PASSWORD = 'Password123!';
const TEST_USER_DATA = {
  full_name: 'Test User',
};

// Test registration flow
async function testSignUp() {
  console.log('🧪 Testing Sign Up Flow...');
  try {
    const { data, error } = await authService.signUp(TEST_EMAIL, TEST_PASSWORD, TEST_USER_DATA);
    
    if (error) {
      console.error('❌ Sign Up Error:', error.message);
      return false;
    }
    
    console.log('✅ Sign Up Success:', data);
    return true;
  } catch (err) {
    console.error('❌ Sign Up Exception:', err.message);
    return false;
  }
}

// Test login flow
async function testSignIn() {
  console.log('🧪 Testing Sign In Flow...');
  try {
    const { data, error } = await authService.signIn(TEST_EMAIL, TEST_PASSWORD);
    
    if (error) {
      console.error('❌ Sign In Error:', error.message);
      return false;
    }
    
    console.log('✅ Sign In Success:', data.user);
    return true;
  } catch (err) {
    console.error('❌ Sign In Exception:', err.message);
    return false;
  }
}

// Test session retrieval
async function testGetSession() {
  console.log('🧪 Testing Get Session...');
  try {
    const { session, error } = await authService.getSession();
    
    if (error) {
      console.error('❌ Get Session Error:', error.message);
      return false;
    }
    
    console.log('✅ Session Retrieved:', session ? 'Valid Session' : 'No Active Session');
    return true;
  } catch (err) {
    console.error('❌ Get Session Exception:', err.message);
    return false;
  }
}

// Test sign out flow
async function testSignOut() {
  console.log('🧪 Testing Sign Out Flow...');
  try {
    const { error } = await authService.signOut();
    
    if (error) {
      console.error('❌ Sign Out Error:', error.message);
      return false;
    }
    
    console.log('✅ Sign Out Success');
    return true;
  } catch (err) {
    console.error('❌ Sign Out Exception:', err.message);
    return false;
  }
}

// Run the tests in sequence
async function runAuthTests() {
  console.log('🔍 Starting Authentication Flow Tests...');
  console.log('------------------------------------');
  
  // Test if Supabase is configured
  console.log('Supabase URL:', supabase.supabaseUrl);
  
  // Run test sequence
  await testSignUp();
  await testSignIn();
  await testGetSession();
  await testSignOut();
  
  console.log('------------------------------------');
  console.log('🏁 Authentication Flow Tests Completed');
}

// Uncomment to run the tests
// runAuthTests();

export { runAuthTests, testSignUp, testSignIn, testGetSession, testSignOut };
