-- TRASHDROP ONBOARDING - UPDATE SQL
-- Safe to run on existing database (uses CREATE OR REPLACE and IF NOT EXISTS)

-- ============================================================================
-- ONBOARDING RPC FUNCTIONS (CREATE OR REPLACE)
-- Updated to use actual database schema (bin_locations, batches, user_stats)
-- ============================================================================

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

-- 3. ADD USER LOCATION
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
    ST_SetSRID(ST_MakePoint(lng, lat), 4326),
    true
  )
  RETURNING id INTO loc_id;

  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'location_added', 'User added location');

  RETURN loc_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. PROCESS QR SCAN
CREATE OR REPLACE FUNCTION process_qr_scan(user_uuid UUID, qr TEXT)
RETURNS JSON AS $$
DECLARE batch record;
BEGIN
  SELECT * INTO batch
  FROM batches
  WHERE id = qr AND status = 'pending';

  IF batch IS NULL THEN
    RETURN JSON_BUILD_OBJECT('error', 'Invalid or already used QR code');
  END IF;

  UPDATE batches 
  SET status = 'used', 
      created_by = user_uuid,
      updated_at = NOW()
  WHERE id = qr;

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
CREATE OR REPLACE FUNCTION create_digital_bin(
  user_uuid UUID,
  location_id UUID,
  fee NUMERIC
)
RETURNS UUID AS $$
DECLARE bin_id UUID;
BEGIN
  INSERT INTO digital_bins (
    user_id, location_id, qr_code_url, fee, status, expires_at
  )
  VALUES (
    user_uuid, 
    location_id, 
    'https://trashdrop.app/bin/' || gen_random_uuid(),
    fee,
    'available',
    NOW() + INTERVAL '7 days'
  )
  RETURNING id INTO bin_id;

  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'digital_bin_requested', 'Digital bin created with fee: ' || fee);

  RETURN bin_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. GET USER ONBOARDING STATE
CREATE OR REPLACE FUNCTION get_user_onboarding_state(user_uuid UUID)
RETURNS JSON AS $$
DECLARE
  location_count INTEGER;
  state TEXT;
  available_bags INTEGER;
  total_bags_scanned INTEGER;
BEGIN
  SELECT COUNT(*) INTO location_count
  FROM bin_locations
  WHERE user_id = user_uuid;
  
  SELECT COALESCE(total_bags, 0) INTO available_bags
  FROM user_stats
  WHERE user_id = user_uuid;
  
  total_bags_scanned := available_bags;
  
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
  FROM bin_locations
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
    location_record.location_name,
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

-- ============================================================================
-- PERMISSIONS (GRANT IF NOT ALREADY GRANTED)
-- ============================================================================

DO $$
BEGIN
  -- Grant permissions if not already granted
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_usage_grants 
    WHERE grantee = 'authenticated' 
    AND object_schema = 'public' 
    AND object_name = 'start_onboarding'
  ) THEN
    GRANT EXECUTE ON FUNCTION start_onboarding TO authenticated;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_usage_grants 
    WHERE grantee = 'authenticated' 
    AND object_schema = 'public' 
    AND object_name = 'set_has_bags'
  ) THEN
    GRANT EXECUTE ON FUNCTION set_has_bags TO authenticated;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_usage_grants 
    WHERE grantee = 'authenticated' 
    AND object_schema = 'public' 
    AND object_name = 'add_user_location'
  ) THEN
    GRANT EXECUTE ON FUNCTION add_user_location TO authenticated;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_usage_grants 
    WHERE grantee = 'authenticated' 
    AND object_schema = 'public' 
    AND object_name = 'process_qr_scan'
  ) THEN
    GRANT EXECUTE ON FUNCTION process_qr_scan TO authenticated;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_usage_grants 
    WHERE grantee = 'authenticated' 
    AND object_schema = 'public' 
    AND object_name = 'create_digital_bin'
  ) THEN
    GRANT EXECUTE ON FUNCTION create_digital_bin TO authenticated;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_usage_grants 
    WHERE grantee = 'authenticated' 
    AND object_schema = 'public' 
    AND object_name = 'get_user_onboarding_state'
  ) THEN
    GRANT EXECUTE ON FUNCTION get_user_onboarding_state TO authenticated;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_usage_grants 
    WHERE grantee = 'authenticated' 
    AND object_schema = 'public' 
    AND object_name = 'create_onboarding_pickup'
  ) THEN
    GRANT EXECUTE ON FUNCTION create_onboarding_pickup TO authenticated;
  END IF;
END $$;

-- ============================================================================
-- POLICIES (DROP AND RECREATE TO AVOID CONFLICTS)
-- ============================================================================

-- Drop existing policies if they exist
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view their own bin locations" ON public.bin_locations;
  DROP POLICY IF EXISTS "Users can create bin locations" ON public.bin_locations;
  DROP POLICY IF EXISTS "Users can update their own bin locations" ON public.bin_locations;
  DROP POLICY IF EXISTS "Users can view their own digital bins" ON public.digital_bins;
  DROP POLICY IF EXISTS "Users can create digital bins" ON public.digital_bins;
  DROP POLICY IF EXISTS "Users can update their own digital bins" ON public.digital_bins;
END $$;

-- Recreate policies
CREATE POLICY "Users can view their own bin locations"
  ON public.bin_locations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create bin locations"
  ON public.bin_locations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bin locations"
  ON public.bin_locations
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own digital bins"
  ON public.digital_bins
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create digital bins"
  ON public.digital_bins
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own digital bins"
  ON public.digital_bins
  FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- INDEXES (CREATE IF NOT EXISTS)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_bin_locations_user_id ON public.bin_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_digital_bins_user_id ON public.digital_bins(user_id);
CREATE INDEX IF NOT EXISTS idx_digital_bins_location_id ON public.digital_bins(location_id);
CREATE INDEX IF NOT EXISTS idx_digital_bins_expires_at ON public.digital_bins(expires_at);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_created_by ON batches(created_by);
CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_pickup_requests_user_id ON pickup_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id);

-- ============================================================================
-- CLEANUP FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_digital_bins()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.digital_bins
    WHERE expires_at < NOW()
    OR is_active = false
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- 8. CHECK ONBOARDING COMPLETION STATUS
CREATE OR REPLACE FUNCTION check_onboarding_completion(user_uuid UUID)
RETURNS JSON AS $$
DECLARE
  onboarding_started BOOLEAN := FALSE;
  has_bags_selected BOOLEAN := FALSE;
  location_added BOOLEAN := FALSE;
  qr_scanned BOOLEAN := FALSE;
  digital_bin_created BOOLEAN := FALSE;
  pickup_requested BOOLEAN := FALSE;
  completion_percentage NUMERIC := 0;
  is_complete BOOLEAN := FALSE;
  next_required_step TEXT;
BEGIN
  -- Check if onboarding was started
  SELECT EXISTS(
    SELECT 1 FROM user_activity 
    WHERE user_id = user_uuid AND activity_type = 'onboarding_started'
  ) INTO onboarding_started;
  
  -- Check if bags selection was made
  SELECT EXISTS(
    SELECT 1 FROM user_activity 
    WHERE user_id = user_uuid AND activity_type IN ('has_bags_true', 'has_bags_false')
  ) INTO has_bags_selected;
  
  -- Check if location was added
  SELECT EXISTS(
    SELECT 1 FROM user_activity 
    WHERE user_id = user_uuid AND activity_type = 'location_added'
  ) INTO location_added;
  
  -- Check if QR was scanned (through qr_scan activity or having batches)
  SELECT EXISTS(
    SELECT 1 FROM user_activity 
    WHERE user_id = user_uuid AND activity_type = 'qr_scan'
  ) INTO qr_scanned;
  
  -- If no QR scan activity, check if user has batches
  IF NOT qr_scanned THEN
    SELECT EXISTS(
      SELECT 1 FROM batches 
      WHERE created_by = user_uuid AND status = 'active'
    ) INTO qr_scanned;
  END IF;
  
  -- Check if digital bin was created
  SELECT EXISTS(
    SELECT 1 FROM user_activity 
    WHERE user_id = user_uuid AND activity_type = 'digital_bin_requested'
  ) INTO digital_bin_created;
  
  -- Check if pickup was requested
  SELECT EXISTS(
    SELECT 1 FROM user_activity 
    WHERE user_id = user_uuid AND activity_type = 'pickup_requested'
  ) INTO pickup_requested;
  
  -- Calculate completion percentage
  completion_percentage := 
    (CASE WHEN onboarding_started THEN 20 ELSE 0 END) +
    (CASE WHEN has_bags_selected THEN 20 ELSE 0 END) +
    (CASE WHEN location_added THEN 20 ELSE 0 END) +
    (CASE WHEN qr_scanned THEN 20 ELSE 0 END) +
    (CASE WHEN digital_bin_created OR pickup_requested THEN 20 ELSE 0 END);
  
  -- Determine if onboarding is complete
  is_complete := onboarding_started AND 
                has_bags_selected AND 
                location_added AND 
                (qr_scanned OR (NOT has_bags_selected AND (digital_bin_created OR pickup_requested)));
  
  -- Determine next required step
  IF NOT onboarding_started THEN
    next_required_step := 'start_onboarding';
  ELSIF NOT has_bags_selected THEN
    next_required_step := 'select_bags';
  ELSIF NOT location_added THEN
    next_required_step := 'add_location';
  ELSIF has_bags_selected AND NOT qr_scanned THEN
    next_required_step := 'scan_qr';
  ELSIF NOT has_bags_selected AND NOT digital_bin_created AND NOT pickup_requested THEN
    next_required_step := 'choose_service';
  ELSE
    next_required_step := 'complete';
  END IF;
  
  RETURN JSON_BUILD_OBJECT(
    'is_complete', is_complete,
    'completion_percentage', completion_percentage,
    'next_required_step', next_required_step,
    'onboarding_started', onboarding_started,
    'has_bags_selected', has_bags_selected,
    'location_added', location_added,
    'qr_scanned', qr_scanned,
    'digital_bin_created', digital_bin_created,
    'pickup_requested', pickup_requested
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permission to authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_usage_grants 
    WHERE grantee = 'authenticated' 
    AND object_schema = 'public' 
    AND object_name = 'check_onboarding_completion'
  ) THEN
    GRANT EXECUTE ON FUNCTION check_onboarding_completion TO authenticated;
  END IF;
END $$;
