-- Onboarding RPC Functions for TrashDrop
-- These functions implement the onboarding flow using existing infrastructure

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

-- 3. ADD USER LOCATION (using existing locations table)
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
  VALUES (user_uuid, name, address, lat, lng, true)
  RETURNING id INTO loc_id;

  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'location_added', 'User added location');

  RETURN loc_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. PROCESS QR SCAN (using existing bag_inventory and bag_orders)
CREATE OR REPLACE FUNCTION process_qr_scan(user_uuid UUID, qr TEXT)
RETURNS JSON AS $$
DECLARE batch record;
BEGIN
  SELECT * INTO batch
  FROM bag_orders
  WHERE batch_qr_code = qr;

  IF batch IS NULL THEN
    RETURN JSON_BUILD_OBJECT('error', 'Invalid QR');
  END IF;

  INSERT INTO bag_inventory (user_id, batch_code, bag_type, batch_id)
  VALUES (user_uuid, qr, batch.bag_type, batch.id);

  UPDATE user_stats
  SET available_bags = available_bags + batch.quantity,
      total_bags_scanned = total_bags_scanned + batch.quantity
  WHERE user_id = user_uuid;

  RETURN JSON_BUILD_OBJECT('status', 'success');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. CREATE DIGITAL BIN (using existing digital_bins and bin_locations)
CREATE OR REPLACE FUNCTION create_digital_bin(
  user_uuid UUID,
  location_id UUID,
  fee NUMERIC
)
RETURNS UUID AS $$
DECLARE bin_id UUID;
BEGIN
  INSERT INTO digital_bins (user_id, location_id, fee, status)
  VALUES (user_uuid, location_id, fee, 'available')
  RETURNING id INTO bin_id;

  INSERT INTO user_activity (user_id, activity_type)
  VALUES (user_uuid, 'digital_bin_requested');

  RETURN bin_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. GET USER ONBOARDING STATE (calculates bags from batches like userService)
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

-- 7. CREATE PICKUP REQUEST (wrapper for existing RPC)
CREATE OR REPLACE FUNCTION create_onboarding_pickup(
  user_uuid UUID,
  location_id UUID,
  bag_count INTEGER DEFAULT 1
)
RETURNS JSON AS $$
DECLARE
  location_record RECORD;
  pickup_result RECORD;
BEGIN
  -- Get location details
  SELECT * INTO location_record
  FROM locations
  WHERE id = location_id AND user_id = user_uuid;
  
  IF location_record IS NULL THEN
    RETURN JSON_BUILD_OBJECT('error', 'Location not found');
  END IF;
  
  -- Create pickup request using existing RPC
  SELECT * INTO pickup_result
  FROM create_pickup_request(
    'pickup_' || EXTRACT(EPOCH FROM NOW())::TEXT,
    user_uuid,
    'available',
    bag_count,
    'general',
    NULL,
    location_record.longitude,
    location_record.latitude,
    0,
    location_record.address
  );
  
  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'pickup_requested', 'Onboarding pickup created');
  
  RETURN JSON_BUILD_OBJECT('status', 'success', 'pickup_id', pickup_result.id);
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
