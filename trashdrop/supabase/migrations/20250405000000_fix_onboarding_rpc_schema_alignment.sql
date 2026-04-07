-- ============================================================
-- FIX: Align Onboarding RPC Functions with Actual DB Schema
-- Date: 2025-04-05
-- 
-- RESTORE: Run RESTORE_onboarding_rpc_original.sql to revert
--
-- Fixes:
--   1. add_user_location: column "name" → "location_name", 
--      column "coordinates" (PostGIS) → "latitude"/"longitude" (numeric)
--   2. create_digital_bin: handle NULL location_id by auto-creating
--      a bin_locations entry (digital_bins.location_id is NOT NULL
--      and FK references bin_locations, not locations)
--   3. create_onboarding_pickup: fix location CHECK constraint
--      (must be POINT format), remove identity column inserts,
--      read lat/lng from locations table correctly
--   4. get_user_onboarding_state: restore has_bags_selection field
--      to eliminate redundant second RPC call
-- ============================================================

-- ============================================================
-- 1. FIX: add_user_location
--    Actual "locations" table columns: location_name, latitude, longitude
-- ============================================================
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
    user_id, location_name, address, latitude, longitude, is_default
  )
  VALUES (
    user_uuid,
    name,
    address,
    lat,
    lng,
    true
  )
  RETURNING id INTO loc_id;

  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'location_added', 'User added location during onboarding');

  RETURN loc_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. FIX: create_digital_bin
--    - digital_bins.location_id is NOT NULL, FK → bin_locations(id)
--    - If location_id is NULL, auto-create a bin_locations entry
--      using the user's default location from "locations" table
-- ============================================================
DROP FUNCTION IF EXISTS create_digital_bin(UUID, UUID);
CREATE OR REPLACE FUNCTION create_digital_bin(
  user_uuid UUID,
  location_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  bin_id UUID;
  resolved_location_id UUID;
  user_location RECORD;
BEGIN
  resolved_location_id := location_id;

  -- If no location_id provided, create one in bin_locations
  -- from the user's default location in "locations" table
  IF resolved_location_id IS NULL THEN
    -- Try to find user's default or most recent location
    SELECT id, location_name, address, latitude, longitude
    INTO user_location
    FROM locations
    WHERE user_id = user_uuid
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1;

    IF user_location IS NOT NULL THEN
      INSERT INTO bin_locations (
        user_id, location_name, address,
        coordinates, is_default
      )
      VALUES (
        user_uuid,
        user_location.location_name,
        user_location.address,
        ST_SetSRID(ST_MakePoint(
          COALESCE(user_location.longitude, 0),
          COALESCE(user_location.latitude, 0)
        ), 4326),
        true
      )
      RETURNING id INTO resolved_location_id;
    ELSE
      -- No location at all — create a placeholder bin_location
      INSERT INTO bin_locations (
        user_id, location_name, address,
        coordinates, is_default
      )
      VALUES (
        user_uuid,
        'Default',
        'Set during onboarding',
        ST_SetSRID(ST_MakePoint(0, 0), 4326),
        true
      )
      RETURNING id INTO resolved_location_id;
    END IF;
  END IF;

  -- Create the digital bin
  INSERT INTO digital_bins (
    user_id, location_id, qr_code_url, status, expires_at
  )
  VALUES (
    user_uuid,
    resolved_location_id,
    'https://trashdrop.app/bin/' || gen_random_uuid(),
    'pending',
    NOW() + INTERVAL '7 days'
  )
  RETURNING id INTO bin_id;

  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'digital_bin_requested', 'Digital bin created during onboarding');

  RETURN bin_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. FIX: create_onboarding_pickup
--    - pickup_requests.location has CHECK constraint requiring
--      POINT(lng lat) format — build from lat/lng
--    - bag_count and points_earned are GENERATED ALWAYS AS IDENTITY
--      — do NOT insert into them
--    - pickup_requests.id is TEXT — cast UUID to text
--    - coordinates column is PostGIS — build from lat/lng
-- ============================================================
CREATE OR REPLACE FUNCTION create_onboarding_pickup(
  user_uuid UUID,
  location_id UUID,
  bag_count INTEGER DEFAULT 1
)
RETURNS JSON AS $$
DECLARE
  loc RECORD;
  pickup_id TEXT;
BEGIN
  -- Get location from "locations" table
  SELECT * INTO loc
  FROM locations
  WHERE id = location_id AND user_id = user_uuid;

  IF loc IS NULL THEN
    RETURN JSON_BUILD_OBJECT('error', 'Location not found');
  END IF;

  -- Build pickup request with correct column types
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
    gen_random_uuid()::TEXT,
    user_uuid,
    'pending',
    'general',
    'Onboarding pickup request',
    -- location must match CHECK: POINT(lng lat)
    'POINT(' || COALESCE(loc.longitude, 0) || ' ' || COALESCE(loc.latitude, 0) || ')',
    -- coordinates is PostGIS geometry
    ST_SetSRID(ST_MakePoint(
      COALESCE(loc.longitude, 0),
      COALESCE(loc.latitude, 0)
    ), 4326),
    0,
    bag_count,
    COALESCE(loc.address, loc.location_name),
    NOW()
  )
  RETURNING id INTO pickup_id;

  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'pickup_requested', 'Onboarding pickup created');

  RETURN JSON_BUILD_OBJECT('status', 'success', 'pickup_id', pickup_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. FIX: get_user_onboarding_state
--    Restore has_bags_selection field to avoid extra RPC call
-- ============================================================
DROP FUNCTION IF EXISTS get_user_onboarding_state(UUID);
CREATE OR REPLACE FUNCTION get_user_onboarding_state(user_uuid UUID)
RETURNS JSON AS $$
DECLARE
  location_count INTEGER;
  state TEXT;
  available_bags INTEGER;
  total_bags_scanned INTEGER;
  has_bags_selection BOOLEAN;
BEGIN
  -- Count locations
  SELECT COUNT(*) INTO location_count
  FROM locations
  WHERE user_id = user_uuid;

  -- Calculate available bags from batches
  SELECT COALESCE(SUM(bag_count), 0) INTO available_bags
  FROM batches
  WHERE created_by = user_uuid;

  -- Calculate total bags scanned from bag_inventory
  SELECT COUNT(*) INTO total_bags_scanned
  FROM bag_inventory
  WHERE user_id = user_uuid;

  -- Check if user has made a "has bags" selection
  SELECT EXISTS(
    SELECT 1 FROM user_activity
    WHERE user_id = user_uuid
    AND activity_type IN ('has_bags_true', 'has_bags_false')
  ) INTO has_bags_selection;

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
    'location_count', location_count,
    'has_bags_selection', has_bags_selection
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Re-grant permissions
-- ============================================================
GRANT EXECUTE ON FUNCTION add_user_location TO authenticated;
GRANT EXECUTE ON FUNCTION create_digital_bin TO authenticated;
GRANT EXECUTE ON FUNCTION create_onboarding_pickup TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_onboarding_state TO authenticated;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
