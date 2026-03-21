-- Fix onboarding state calculation to use actual bag data from batches table
-- This ensures users with existing batches don't see onboarding inappropriately

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

-- Grant permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_onboarding_state TO authenticated;
