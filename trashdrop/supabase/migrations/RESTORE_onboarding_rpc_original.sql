-- ============================================================
-- RESTORE FILE: Original Onboarding RPC Functions
-- Run this to revert back to the original RPCs if needed.
-- Generated: 2025-04-05
-- ============================================================

-- 1. RESTORE: add_user_location (original - uses PostGIS coordinates column)
CREATE OR REPLACE FUNCTION add_user_location(
  user_uuid UUID,
  name TEXT,
  address TEXT,
  lat NUMERIC,
  lng NUMERIC
)
RETURNS UUID AS $$
DECLARE loc_id UUID;
BEGIN
  INSERT INTO locations (
    user_id, name, address, coordinates, is_default
  )
  VALUES (
    user_uuid, 
    name, 
    address, 
    ST_SetSRID(ST_MakePoint(lng, lat), 4326),
    true
  )
  RETURNING id INTO loc_id;

  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'location_added', 'User added location');

  RETURN loc_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. RESTORE: create_digital_bin (original - requires location_id)
DROP FUNCTION IF EXISTS create_digital_bin(UUID, UUID);
CREATE OR REPLACE FUNCTION create_digital_bin(
  user_uuid UUID,
  location_id UUID
)
RETURNS UUID AS $$
DECLARE bin_id UUID;
BEGIN
  INSERT INTO digital_bins (
    user_id, location_id, qr_code_url, status, expires_at
  )
  VALUES (
    user_uuid, 
    location_id, 
    'https://trashdrop.app/bin/' || gen_random_uuid(),
    'available',
    NOW() + INTERVAL '7 days'
  )
  RETURNING id INTO bin_id;

  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'digital_bin_requested', 'Digital bin created');

  RETURN bin_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RESTORE: create_onboarding_pickup (original - reads from locations table)
CREATE OR REPLACE FUNCTION create_onboarding_pickup(
  user_uuid UUID,
  location_id UUID,
  bag_count INTEGER DEFAULT 1
)
RETURNS JSON AS $$
DECLARE
  location_record RECORD;
  pickup_id UUID;
BEGIN
  SELECT * INTO location_record
  FROM locations
  WHERE id = location_id AND user_id = user_uuid;
  
  IF location_record IS NULL THEN
    RETURN JSON_BUILD_OBJECT('error', 'Location not found');
  END IF;
  
  INSERT INTO pickup_requests (
    id,
    user_id,
    status,
    waste_type,
    special_instructions,
    location,
    coordinates,
    fee,
    estimated_volume,
    address,
    created_at
  )
  VALUES (
    gen_random_uuid(),
    user_uuid,
    'available',
    'general',
    'Onboarding pickup request',
    location_record.name,
    location_record.coordinates,
    0,
    bag_count,
    location_record.address,
    NOW()
  )
  RETURNING id INTO pickup_id;
  
  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'pickup_requested', 'Onboarding pickup created');
  
  RETURN JSON_BUILD_OBJECT('status', 'success', 'pickup_id', pickup_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RESTORE: get_user_onboarding_state (from fix migration - without has_bags_selection)
DROP FUNCTION IF EXISTS get_user_onboarding_state(UUID);
CREATE OR REPLACE FUNCTION get_user_onboarding_state(user_uuid UUID)
RETURNS JSON AS $$
DECLARE
  location_count INTEGER;
  state TEXT;
  available_bags INTEGER;
  total_bags_scanned INTEGER;
BEGIN
  SELECT COUNT(*) INTO location_count
  FROM locations
  WHERE user_id = user_uuid;
  
  SELECT COALESCE(SUM(bag_count), 0) INTO available_bags
  FROM batches
  WHERE created_by = user_uuid;
  
  SELECT COUNT(*) INTO total_bags_scanned
  FROM bag_inventory
  WHERE user_id = user_uuid;
  
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

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION add_user_location TO authenticated;
GRANT EXECUTE ON FUNCTION create_digital_bin TO authenticated;
GRANT EXECUTE ON FUNCTION create_onboarding_pickup TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_onboarding_state TO authenticated;

-- ============================================================
-- END OF RESTORE FILE
-- ============================================================
