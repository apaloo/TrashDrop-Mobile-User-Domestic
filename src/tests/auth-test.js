// Authentication Flow Test Script
// This script can be run to test Supabase authentication integration

// Load environment variables using dotenv
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import supabase, { authService } from '../utils/supabaseClient.js';

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
  console.log('🧪 Testing Session Flow...');
  try {
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('❌ Session Error:', error.message);
      return false;
    }
    
    console.log('✅ Session Success:', data.session);
    return true;
  } catch (err) {
    console.error('❌ Session Exception:', err.message);
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
  console.log('🚀 Starting Authentication Tests...');
  
  // Clear any existing session
  await testSignOut();
  
  // Run tests
  const signUpResult = await testSignUp();
  if (!signUpResult) {
    console.error('❌ Sign Up Test Failed');
    return;
  }

  const signInResult = await testSignIn();
  if (!signInResult) {
    console.error('❌ Sign In Test Failed');
    return;
  }

  const sessionResult = await testGetSession();
  if (!sessionResult) {
    console.error('❌ Session Test Failed');
    return;
  }

  const signOutResult = await testSignOut();
  if (!signOutResult) {
    console.error('❌ Sign Out Test Failed');
    return;
  }

  console.log('✅ All Authentication Tests Passed!');
}

// Run the tests
runAuthTests();
