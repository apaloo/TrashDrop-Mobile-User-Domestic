// Debug script to check onboarding state for current user
// Run in browser console

async function debugOnboarding() {
  console.log('=== DEBUGGING ONBOARDING ===');
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  console.log('Current user:', user?.id);
  
  if (!user) {
    console.error('No authenticated user found');
    return;
  }
  
  try {
    // Test 1: Check user state directly via RPC
    console.log('\n1. Testing RPC get_user_onboarding_state...');
    const { data: state, error: stateError } = await supabase
      .rpc('get_user_onboarding_state', { user_uuid: user.id });
    
    if (stateError) {
      console.error('❌ RPC error:', stateError);
    } else {
      console.log('✅ RPC state:', state);
    }
    
    // Test 2: Check user stats
    console.log('\n2. Checking user_stats...');
    const { data: stats, error: statsError } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (statsError && statsError.code !== 'PGRST116') {
      console.error('❌ Stats error:', statsError);
    } else {
      console.log('✅ User stats:', stats);
    }
    
    // Test 3: Check bin_locations
    console.log('\n3. Checking bin_locations...');
    const { data: locations, error: locationsError } = await supabase
      .from('bin_locations')
      .select('*')
      .eq('user_id', user.id);
    
    if (locationsError) {
      console.error('❌ Locations error:', locationsError);
    } else {
      console.log('✅ Locations count:', locations?.length || 0);
      console.log('✅ Locations:', locations);
    }
    
    // Test 4: Check if onboarding was dismissed
    console.log('\n4. Checking onboarding dismissal...');
    const dismissedKey = `trashdrop_onboarding_dismissed_${user.id}`;
    const hasDismissed = localStorage.getItem(dismissedKey);
    console.log('Dismissed key:', dismissedKey);
    console.log('Has dismissed:', !!hasDismissed);
    
    // Test 5: Manual shouldShowOnboarding check
    console.log('\n5. Manual shouldShowOnboarding check...');
    const availableBags = stats?.total_bags || 0;
    const totalBagsScanned = stats?.total_bags || 0;
    const locationCount = locations?.length || 0;
    
    const shouldShow = availableBags === 0 && totalBagsScanned === 0 && !hasDismissed;
    
    console.log('Calculation:', {
      availableBags,
      totalBagsScanned,
      locationCount,
      hasDismissed: !!hasDismissed,
      shouldShow
    });
    
    // Test 6: Force onboarding for testing
    console.log('\n6. Testing force onboarding...');
    localStorage.removeItem(dismissedKey);
    console.log('Cleared dismissed flag');
    
    // Clear user stats to force onboarding
    if (stats) {
      const { error: deleteError } = await supabase
        .from('user_stats')
        .delete()
        .eq('user_id', user.id);
      
      if (deleteError) {
        console.error('❌ Error clearing stats:', deleteError);
      } else {
        console.log('✅ Cleared user stats');
      }
    }
    
    // Clear locations
    if (locations && locations.length > 0) {
      const { error: deleteError } = await supabase
        .from('bin_locations')
        .delete()
        .eq('user_id', user.id);
      
      if (deleteError) {
        console.error('❌ Error clearing locations:', deleteError);
      } else {
        console.log('✅ Cleared locations');
      }
    }
    
    console.log('\n=== REFRESH PAGE TO TEST ONBOARDING ===');
    
  } catch (error) {
    console.error('❌ Debug error:', error);
  }
}

// Expose for testing
window.debugOnboarding = debugOnboarding;
console.log('Run debugOnboarding() in console to debug onboarding');
