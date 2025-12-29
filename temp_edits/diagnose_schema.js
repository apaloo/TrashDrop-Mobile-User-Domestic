// Load environment variables from .env.development
require('dotenv').config({ path: '.env.development' });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

async function diagnoseSchema() {
  try {
    console.log('=== SCHEMA DIAGNOSIS ===\n');
    
    // 1. Check if batches table exists and get structure
    console.log('1. Checking batches table structure...');
    
    // Try to select with limit 0 to get column info
    const { data: batchData, error: batchError } = await supabase
      .from('batches')
      .select('*')
      .limit(0);
    
    if (batchError) {
      console.log('❌ Batches table error:', batchError.message);
    } else {
      console.log('✅ Batches table exists');
    }

    // 2. Check auth.users table for our test user
    console.log('\n2. Checking test user in auth.users...');
    const testUserId = '123e4567-e89b-12d3-a456-426614174000';
    
    const { data: userData, error: userError } = await supabase
      .from('auth.users')
      .select('id, email')
      .eq('id', testUserId);
    
    if (userError) {
      console.log('❌ Auth users query error:', userError.message);
      console.log('   This might be expected - auth.users may not be directly queryable');
    } else if (userData && userData.length > 0) {
      console.log('✅ Test user found:', userData[0]);
    } else {
      console.log('❌ Test user not found in auth.users');
    }

    // 3. Check bags table
    console.log('\n3. Checking bags table...');
    const { data: bagData, error: bagError } = await supabase
      .from('bags')
      .select('*')
      .limit(0);
    
    if (bagError) {
      console.log('❌ Bags table error:', bagError.message);
    } else {
      console.log('✅ Bags table exists');
    }

    // 4. Try a minimal insert test (this will likely fail due to RLS)
    console.log('\n4. Testing minimal batch insert...');
    const { data: insertData, error: insertError } = await supabase
      .from('batches')
      .insert([{
        batch_number: `TEST-DIRECT-${Date.now()}`,
        bag_count: 1,
        status: 'active',
        created_by: testUserId
      }])
      .select();

    if (insertError) {
      console.log('❌ Insert error:', insertError.message);
      console.log('   Error details:', insertError);
    } else {
      console.log('✅ Insert successful:', insertData);
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

diagnoseSchema();
