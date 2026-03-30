// Debug script to check location data
// Run in browser console

async function debugLocationData() {
  console.log('=== Debugging Location Data ===');
  
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    console.log('Current user:', user?.id);
    
    if (!user) {
      console.error('No authenticated user found');
      return;
    }
    
    // 1. Check bin_locations table directly
    console.log('\n1. Checking bin_locations table...');
    const { data: locations, error: locError } = await supabase
      .from('bin_locations')
      .select('*')
      .eq('user_id', user.id);
    
    if (locError) {
      console.error('❌ Error fetching locations:', locError);
    } else {
      console.log('✅ Found locations:', locations);
      console.log('📊 Location count:', locations?.length || 0);
    }
    
    // 2. Check user_activity for location additions
    console.log('\n2. Checking user_activity for location additions...');
    const { data: activities, error: actError } = await supabase
      .from('user_activity')
      .select('*')
      .eq('user_id', user.id)
      .eq('activity_type', 'location_added')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (actError) {
      console.error('❌ Error fetching activities:', actError);
    } else {
      console.log('✅ Location activities:', activities);
    }
    
    // 3. Check localStorage for locations
    console.log('\n3. Checking localStorage...');
    const storedLocations = localStorage.getItem(`trashdrop_locations_${user.id}`);
    console.log('📦 Stored locations:', storedLocations);
    
    // 4. Test RPC function again
    console.log('\n4. Testing RPC function...');
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_user_onboarding_state', { user_uuid: user.id });
    
    if (rpcError) {
      console.error('❌ RPC error:', rpcError);
    } else {
      console.log('✅ RPC result:', rpcData);
    }
    
    console.log('\n=== Debug Complete ===');
    
  } catch (error) {
    console.error('❌ Debug error:', error);
  }
}

// Expose for testing
window.debugLocationData = debugLocationData;
console.log('Run debugLocationData() in console to debug location data');
