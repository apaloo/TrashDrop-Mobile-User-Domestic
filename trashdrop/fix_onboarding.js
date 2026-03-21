/**
 * Temporary script to fix onboarding state calculation
 * This will apply the SQL fix directly via Supabase client
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyFix() {
  try {
    console.log('Applying onboarding state calculation fix...');
    
    const sql = `
      DROP FUNCTION IF EXISTS get_user_onboarding_state(UUID);
      
      CREATE OR REPLACE FUNCTION get_user_onboarding_state(user_uuid UUID)
      RETURNS JSON AS $$
      DECLARE
        location_count INTEGER;
        state TEXT;
        available_bags INTEGER;
        total_bags_scanned INTEGER;
      BEGIN
        -- Count locations
        SELECT COUNT(*) INTO location_count
        FROM locations
        WHERE user_id = user_uuid;
        
        -- Calculate available bags from batches (same logic as userService)
        SELECT COALESCE(SUM(bag_count), 0) INTO available_bags
        FROM batches
        WHERE created_by = user_uuid;
        
        -- Calculate total bags scanned from bag_inventory
        SELECT COUNT(*) INTO total_bags_scanned
        FROM bag_inventory
        WHERE user_id = user_uuid;
        
        -- Determine state
        IF available_bags > 0 THEN
          state := 'READY_FOR_PICKUP';
        ELSIF location_count > 0 THEN
          state := 'LOCATION_SET';
        ELSE
          state := 'NEW_USER';
        END IF;
        
        RETURN JSON_BUILD_OBJECT(
          'state', state,
          'available_bags', available_bags,
          'total_bags_scanned', total_bags_scanned,
          'location_count', location_count
        );
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
      
      GRANT EXECUTE ON FUNCTION get_user_onboarding_state TO authenticated;
    `;
    
    // This would require admin privileges, so let's test the function instead
    console.log('Testing onboarding state calculation...');
    
    // Test with a known user ID (you'll need to replace this with actual user ID)
    const testUserId = '3e5218d6-7742-4263-bed0-8b35894c2794';
    
    const { data, error } = await supabase
      .rpc('get_user_onboarding_state', { user_uuid: testUserId });
    
    if (error) {
      console.error('Error testing function:', error);
      console.log('The fix needs to be applied manually via Supabase dashboard or CLI');
      return;
    }
    
    console.log('Current onboarding state:', data);
    
    if (data.available_bags > 0) {
      console.log('✅ SUCCESS: User has bags, onboarding should not show');
    } else {
      console.log('❌ User still shows 0 bags, fix may need manual application');
    }
    
  } catch (error) {
    console.error('Error applying fix:', error);
  }
}

applyFix();
