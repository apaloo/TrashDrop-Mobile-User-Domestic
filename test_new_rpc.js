// Test script to check if new RPC functions are deployed
// Run in browser console

async function testNewRPCFunctions() {
  console.log('=== Testing New RPC Functions ===');
  
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    console.log('Current user:', user?.id);
    
    if (!user) {
      console.error('No authenticated user found');
      return;
    }
    
    // Test 1: Check if get_user_has_bags_selection exists
    console.log('\n1. Testing get_user_has_bags_selection...');
    try {
      const { data, error } = await supabase
        .rpc('get_user_has_bags_selection', { user_uuid: user.id });
      
      if (error) {
        console.error('❌ RPC not found or error:', error);
        if (error.message.includes('function') && error.message.includes('does not exist')) {
          console.log('🔄 RPC function needs to be deployed');
        }
      } else {
        console.log('✅ RPC function exists, result:', data);
      }
    } catch (err) {
      console.error('❌ RPC call failed:', err);
    }
    
    // Test 2: Check updated get_user_onboarding_state
    console.log('\n2. Testing updated get_user_onboarding_state...');
    try {
      const { data, error } = await supabase
        .rpc('get_user_onboarding_state', { user_uuid: user.id });
      
      if (error) {
        console.error('❌ RPC error:', error);
      } else {
        console.log('✅ RPC result:', data);
        console.log('📊 Has has_bags_selection field:', 'has_bags_selection' in data);
      }
    } catch (err) {
      console.error('❌ RPC call failed:', err);
    }
    
    console.log('\n=== Test Complete ===');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

// Expose for testing
window.testNewRPCFunctions = testNewRPCFunctions;
console.log('Run testNewRPCFunctions() in console to test new RPC functions');
