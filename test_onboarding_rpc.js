// Test script to verify onboarding RPC functions
// Run in browser console on http://localhost:3000

async function testOnboardingRPC() {
  console.log('=== Testing Onboarding RPC Functions ===');
  
  try {
    // Test 1: Get user state (should work for authenticated user)
    console.log('\n1. Testing get_user_onboarding_state...');
    const { data: state, error: stateError } = await supabase
      .rpc('get_user_onboarding_state', { user_uuid: 'test-user-id' });
    
    if (stateError) {
      console.error('❌ State RPC error:', stateError);
    } else {
      console.log('✅ State RPC response:', state);
    }
    
    // Test 2: Start onboarding
    console.log('\n2. Testing start_onboarding...');
    const { data: start, error: startError } = await supabase
      .rpc('start_onboarding', { user_uuid: 'test-user-id' });
    
    if (startError) {
      console.error('❌ Start RPC error:', startError);
    } else {
      console.log('✅ Start RPC response:', start);
    }
    
    // Test 3: Set has bags
    console.log('\n3. Testing set_has_bags...');
    const { data: bags, error: bagsError } = await supabase
      .rpc('set_has_bags', { user_uuid: 'test-user-id', has_bags: true });
    
    if (bagsError) {
      console.error('❌ Bags RPC error:', bagsError);
    } else {
      console.log('✅ Bags RPC response:', bags);
    }
    
    // Test 4: Add location
    console.log('\n4. Testing add_user_location...');
    const { data: location, error: locationError } = await supabase
      .rpc('add_user_location', {
        user_uuid: 'test-user-id',
        name: 'Test Location',
        address: '123 Test St',
        lat: 5.6037,
        lng: -0.1870
      });
    
    if (locationError) {
      console.error('❌ Location RPC error:', locationError);
    } else {
      console.log('✅ Location RPC response (location ID):', location);
    }
    
    // Test 5: Check onboarding service integration
    console.log('\n5. Testing onboarding service integration...');
    if (window.onboardingService) {
      const serviceState = await window.onboardingService.getUserState('test-user-id');
      console.log('✅ Onboarding service state:', serviceState);
    } else {
      console.log('❌ onboardingService not available on window');
    }
    
    console.log('\n=== RPC Test Complete ===');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Auto-expose for testing
window.testOnboardingRPC = testOnboardingRPC;
console.log('Run testOnboardingRPC() in console to test onboarding functions');
