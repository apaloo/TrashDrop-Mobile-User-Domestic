// Test Supabase connectivity
// Run in browser console

async function testSupabaseConnection() {
  console.log('=== Testing Supabase Connection ===');
  
  try {
    // Test basic Supabase connectivity
    console.log('1. Testing basic connection...');
    const { data, error } = await supabase.from('profiles').select('count').limit(1);
    
    if (error) {
      console.error('❌ Supabase connection failed:', error);
    } else {
      console.log('✅ Supabase connection working');
    }
    
    // Test RPC function specifically
    console.log('2. Testing RPC function...');
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_user_onboarding_state', { user_uuid: user.id });
      
      if (rpcError) {
        console.error('❌ RPC call failed:', rpcError);
      } else {
        console.log('✅ RPC call working:', rpcData);
      }
    }
    
  } catch (error) {
    console.error('❌ Connection test failed:', error);
  }
}

// Expose for testing
window.testSupabaseConnection = testSupabaseConnection;
console.log('Run testSupabaseConnection() in console to test connection');
