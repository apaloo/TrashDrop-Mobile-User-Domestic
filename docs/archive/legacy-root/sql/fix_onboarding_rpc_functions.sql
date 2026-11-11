-- Fix onboarding RPC functions - Clean version
-- This script drops existing functions and recreates them with correct signatures

-- Drop existing functions to avoid naming conflicts
DROP FUNCTION IF EXISTS start_onboarding(UUID);
DROP FUNCTION IF EXISTS set_has_bags(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS add_user_location(UUID, TEXT, TEXT, NUMERIC, NUMERIC);
DROP FUNCTION IF EXISTS process_qr_scan(UUID, TEXT);
DROP FUNCTION IF EXISTS create_digital_bin(UUID, UUID, NUMERIC);
DROP FUNCTION IF EXISTS create_digital_bin(UUID, UUID);
DROP FUNCTION IF EXISTS get_user_onboarding_state(UUID);
DROP FUNCTION IF EXISTS create_onboarding_pickup(UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS get_user_has_bags_selection(UUID);

-- 1. START ONBOARDING
-- Tracks when user begins onboarding process
CREATE OR REPLACE FUNCTION start_onboarding(user_uuid UUID)
RETURNS JSON AS $$
BEGIN
  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'onboarding_started', 'User started onboarding');

  RETURN JSON_BUILD_OBJECT('status', 'started');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. SET HAS BAGS
-- Records user's response to "Do you have bags?" question
CREATE OR REPLACE FUNCTION set_has_bags(user_uuid UUID, has_bags BOOLEAN)
RETURNS JSON AS $$
BEGIN
  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (
    user_uuid,
    CASE WHEN has_bags THEN 'has_bags_true' ELSE 'has_bags_false' END,
    'User selection'
  );

  RETURN JSON_BUILD_OBJECT('next_step',
    CASE WHEN has_bags THEN 'location' ELSE 'choose_service' END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. ADD USER LOCATION
-- Creates location in locations table with PostGIS coordinates
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
    ST_SetSRID(ST_MakePoint(lng, lat), 4326), -- PostGIS Point (longitude, latitude)
    true
  )
  RETURNING id INTO loc_id;

  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'location_added', 'User added location');

  RETURN loc_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. PROCESS QR SCAN
-- Activates batch and updates user stats when QR code is scanned
CREATE OR REPLACE FUNCTION process_qr_scan(user_uuid UUID, qr TEXT)
RETURNS JSON AS $$
DECLARE batch record;
BEGIN
  -- Find the batch by QR code - cast to UUID if needed
  SELECT * INTO batch
  FROM batches
  WHERE id = qr::UUID AND status = 'pending';

  IF batch IS NULL THEN
    RETURN JSON_BUILD_OBJECT('error', 'Invalid or already used QR code');
  END IF;

  -- Update batch to mark as used by this user
  UPDATE batches 
  SET status = 'used', 
      created_by = user_uuid,
      updated_at = NOW()
  WHERE id = qr::UUID;

  -- Update user stats
  INSERT INTO user_stats (user_id, total_batches, total_bags, created_at)
  SELECT 
    user_uuid as user_id,
    1 as total_batches,
    COALESCE(batch.bag_count, 1) as total_bags,
    NOW() as created_at
  ON CONFLICT (user_id) DO UPDATE
  SET 
    total_batches = user_stats.total_batches + 1,
    total_bags = user_stats.total_bags + COALESCE(batch.bag_count, 1),
    updated_at = NOW();

  RETURN JSON_BUILD_OBJECT(
    'status', 'success',
    'bag_count', COALESCE(batch.bag_count, 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. CREATE DIGITAL BIN
-- Creates digital bin with QR URL and 7-day expiration (updated signature)
CREATE OR REPLACE FUNCTION create_digital_bin(
  user_uuid UUID,
  location_id UUID
)
RETURNS UUID AS $$
DECLARE bin_id UUID;
BEGIN
  -- Create QR code URL for the digital bin
  INSERT INTO digital_bins (
    user_id, location_id, qr_code_url, status, expires_at
  )
  VALUES (
    user_uuid, 
    location_id, 
    'https://trashdrop.app/bin/' || gen_random_uuid(), -- Generate QR URL
    'available',
    NOW() + INTERVAL '7 days' -- Expires in 7 days
  )
  RETURNING id INTO bin_id;

  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'digital_bin_requested', 'Digital bin created');

  RETURN bin_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. GET USER ONBOARDING STATE
-- Calculates user's current onboarding state from database
CREATE OR REPLACE FUNCTION get_user_onboarding_state(user_uuid UUID)
RETURNS JSON AS $$
DECLARE
  location_count INTEGER;
  state TEXT;
  available_bags INTEGER;
  total_bags_scanned INTEGER;
BEGIN
  -- Count locations from locations table
  SELECT COUNT(*) INTO location_count
  FROM locations
  WHERE user_id = user_uuid;
  
  -- Calculate available bags from user_stats (total_bags = scanned bags)
  SELECT COALESCE(total_bags, 0) INTO available_bags
  FROM user_stats
  WHERE user_id = user_uuid;
  
  -- For onboarding, total_bags_scanned is the same as available_bags
  total_bags_scanned := available_bags;
  
  -- Determine state
  IF total_bags_scanned > 0 THEN
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

-- 7. CREATE PICKUP REQUEST
-- Creates pickup request using actual pickup_requests table structure
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
  -- Get location details from locations
  SELECT * INTO location_record
  FROM locations
  WHERE id = location_id AND user_id = user_uuid;
  
  IF location_record IS NULL THEN
    RETURN JSON_BUILD_OBJECT('error', 'Location not found');
  END IF;
  
  -- Create pickup request using actual pickup_requests table structure
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
    location_record.coordinates, -- PostGIS geometry
    0, -- Default fee for onboarding
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

-- 8. GET USER'S "HAS BAGS" SELECTION
-- Returns the user's most recent "has bags" selection from user_activity
CREATE OR REPLACE FUNCTION get_user_has_bags_selection(user_uuid UUID)
RETURNS JSON AS $$
DECLARE
  has_bags BOOLEAN;
  activity_record RECORD;
BEGIN
  -- Get the most recent has_bags activity
  SELECT * INTO activity_record
  FROM user_activity
  WHERE user_id = user_uuid 
    AND activity_type IN ('has_bags_true', 'has_bags_false')
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF activity_record IS NULL THEN
    RETURN JSON_BUILD_OBJECT('has_bags', NULL, 'selection_made', false);
  END IF;
  
  has_bags := activity_record.activity_type = 'has_bags_true';
  
  RETURN JSON_BUILD_OBJECT(
    'has_bags', has_bags,
    'selection_made', true,
    'selected_at', activity_record.created_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
