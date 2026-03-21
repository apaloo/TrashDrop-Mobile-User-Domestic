-- Onboarding RPC Functions for TrashDrop
-- Updated to use actual database schema (bin_locations, not locations)
-- Updated to use actual pickup_requests table structure

-- 1. START ONBOARDING
CREATE OR REPLACE FUNCTION start_onboarding(user_uuid UUID)
RETURNS JSON AS $$
BEGIN
  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'onboarding_started', 'User started onboarding');

  RETURN JSON_BUILD_OBJECT('status', 'started');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. SET HAS BAGS
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

-- 3. ADD USER LOCATION (using bin_locations table with PostGIS)
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
  INSERT INTO bin_locations (
    user_id, location_name, address, coordinates, is_default
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

-- 4. PROCESS QR SCAN (using batches table)
CREATE OR REPLACE FUNCTION process_qr_scan(user_uuid UUID, qr TEXT)
RETURNS JSON AS $$
DECLARE batch record;
BEGIN
  -- Find the batch by QR code
  SELECT * INTO batch
  FROM batches
  WHERE id = qr AND status = 'pending';

  IF batch IS NULL THEN
    RETURN JSON_BUILD_OBJECT('error', 'Invalid or already used QR code');
  END IF;

  -- Update batch to mark as used by this user
  UPDATE batches 
  SET status = 'used', 
      created_by = user_uuid,
      updated_at = NOW()
  WHERE id = qr;

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

-- 5. CREATE DIGITAL BIN (using bin_locations and digital_bins tables)
CREATE OR REPLACE FUNCTION create_digital_bin(
  user_uuid UUID,
  location_id UUID,
  fee NUMERIC
)
RETURNS UUID AS $$
DECLARE bin_id UUID;
BEGIN
  -- Create QR code URL for the digital bin
  INSERT INTO digital_bins (
    user_id, location_id, qr_code_url, fee, status, expires_at
  )
  VALUES (
    user_uuid, 
    location_id, 
    'https://trashdrop.app/bin/' || gen_random_uuid(), -- Generate QR URL
    fee,
    'available',
    NOW() + INTERVAL '7 days' -- Expires in 7 days
  )
  RETURNING id INTO bin_id;

  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'digital_bin_requested', 'Digital bin created with fee: ' || fee);

  RETURN bin_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. GET USER ONBOARDING STATE (using actual tables)
CREATE OR REPLACE FUNCTION get_user_onboarding_state(user_uuid UUID)
RETURNS JSON AS $$
DECLARE
  location_count INTEGER;
  state TEXT;
  available_bags INTEGER;
  total_bags_scanned INTEGER;
BEGIN
  -- Count locations from bin_locations table
  SELECT COUNT(*) INTO location_count
  FROM bin_locations
  WHERE user_id = user_uuid;
  
  -- Calculate available bags from user_stats (total_bags = scanned bags)
  SELECT COALESCE(total_bags, 0) INTO available_bags
  FROM user_stats
  WHERE user_id = user_uuid;
  
  -- Handle case where no user_stats record exists
  IF available_bags IS NULL THEN
    available_bags := 0;
  END IF;
  
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

-- 7. CREATE PICKUP REQUEST (using actual pickup_requests table)
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
  -- Get location details from bin_locations
  SELECT * INTO location_record
  FROM bin_locations
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
    location_record.location_name,
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

-- Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION start_onboarding TO authenticated;
GRANT EXECUTE ON FUNCTION set_has_bags TO authenticated;
GRANT EXECUTE ON FUNCTION add_user_location TO authenticated;
GRANT EXECUTE ON FUNCTION process_qr_scan TO authenticated;
GRANT EXECUTE ON FUNCTION create_digital_bin TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_onboarding_state TO authenticated;
GRANT EXECUTE ON FUNCTION create_onboarding_pickup TO authenticated;
