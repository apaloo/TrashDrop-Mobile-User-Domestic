-- TRASHDROP ONBOARDING - COMPLETE SQL REFERENCE
-- All database functions and migrations for onboarding system

-- ============================================================================
-- ONBOARDING RPC FUNCTIONS
-- Updated to use actual database schema (bin_locations, batches, user_stats)
-- ============================================================================

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
-- Creates location in bin_locations table with PostGIS coordinates
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

-- 4. PROCESS QR SCAN
-- Activates batch and updates user stats when QR code is scanned
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

-- 5. CREATE DIGITAL BIN
-- Creates digital bin with QR URL and 7-day expiration
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
  -- Count locations from bin_locations table
  SELECT COUNT(*) INTO location_count
  FROM bin_locations
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

-- ============================================================================
-- PERMISSIONS
-- Grant execution rights to authenticated users
-- ============================================================================

GRANT EXECUTE ON FUNCTION start_onboarding TO authenticated;
GRANT EXECUTE ON FUNCTION set_has_bags TO authenticated;
GRANT EXECUTE ON FUNCTION add_user_location TO authenticated;
GRANT EXECUTE ON FUNCTION process_qr_scan TO authenticated;
GRANT EXECUTE ON FUNCTION create_digital_bin TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_onboarding_state TO authenticated;
GRANT EXECUTE ON FUNCTION create_onboarding_pickup TO authenticated;

-- ============================================================================
-- SUPPORTING TABLE STRUCTURES
-- Reference for tables used by onboarding functions
-- ============================================================================

-- bin_locations table (user locations with PostGIS coordinates)
CREATE TABLE IF NOT EXISTS public.bin_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  location_name TEXT NOT NULL,
  address TEXT NOT NULL,
  coordinates GEOMETRY(Point, 4326) NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- digital_bins table (for paid digital bin service)
CREATE TABLE IF NOT EXISTS public.digital_bins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  location_id UUID REFERENCES public.bin_locations(id) ON DELETE CASCADE NOT NULL,
  qr_code_url TEXT NOT NULL,
  frequency VARCHAR(50) NOT NULL DEFAULT 'weekly',
  waste_type VARCHAR(50) NOT NULL DEFAULT 'general',
  bag_count INTEGER NOT NULL DEFAULT 1,
  special_instructions TEXT,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_frequency CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  CONSTRAINT check_waste_type CHECK (waste_type IN ('general', 'recycling', 'organic')),
  CONSTRAINT check_bag_count CHECK (bag_count >= 1 AND bag_count <= 10)
);

-- batches table (for QR code scanning)
-- Assumes existing structure with:
-- - id UUID (QR code identifier)
-- - status TEXT ('pending', 'used')
-- - bag_count INTEGER
-- - created_by UUID (user who activated)
-- - updated_at TIMESTAMPTZ

-- user_stats table (tracks user progress)
-- Assumes existing structure with:
-- - user_id UUID PRIMARY KEY
-- - total_bags INTEGER
-- - total_batches INTEGER
-- - created_at TIMESTAMPTZ
-- - updated_at TIMESTAMPTZ

-- pickup_requests table (for pickup requests)
-- Assumes existing structure with:
-- - id UUID
-- - user_id UUID
-- - status TEXT
-- - waste_type TEXT
-- - special_instructions TEXT
-- - location TEXT
-- - coordinates GEOMETRY(Point, 4326)
-- - fee NUMERIC
-- - estimated_volume INTEGER (bag_count)
-- - address TEXT
-- - created_at TIMESTAMPTZ

-- user_activity table (tracks all user actions)
-- Assumes existing structure with:
-- - user_id UUID
-- - activity_type TEXT
-- - description TEXT
-- - created_at TIMESTAMPTZ

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- Recommended indexes for onboarding queries
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
-- ROW LEVEL SECURITY (RLS)
-- Ensure users can only access their own data
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.bin_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_bins ENABLE ROW LEVEL SECURITY;

-- Policies for bin_locations
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

-- Policies for digital_bins
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
-- TRIGGERS FOR UPDATED_AT
-- Auto-update timestamps
-- ============================================================================

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_bin_locations_updated_at
  BEFORE UPDATE ON public.bin_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_digital_bins_updated_at
  BEFORE UPDATE ON public.digital_bins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- CLEANUP FUNCTIONS
-- Maintenance functions for expired data
-- ============================================================================

-- Function to clean up expired digital bins
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

-- ============================================================================
-- TESTING QUERIES
-- Sample queries for testing onboarding functions
-- ============================================================================

-- Test user state calculation
SELECT * FROM get_user_onboarding_state('your-user-id-here');

-- Test location creation
SELECT add_user_location('your-user-id-here', 'Home', '123 Main St', 5.6037, -0.1870);

-- Test QR scan (use actual batch ID)
SELECT process_qr_scan('your-user-id-here', 'actual-batch-uuid');

-- Test digital bin creation
SELECT create_digital_bin('your-user-id-here', 'location-uuid-here', 30);

-- Test pickup request creation
SELECT create_onboarding_pickup('your-user-id-here', 'location-uuid-here', 2);

-- View user's onboarding progress
SELECT 
  bl.location_name,
  bl.address,
  us.total_bags,
  us.total_batches,
  db.id as digital_bin_id,
  db.expires_at
FROM bin_locations bl
LEFT JOIN user_stats us ON bl.user_id = us.user_id
LEFT JOIN digital_bins db ON bl.user_id = db.user_id
WHERE bl.user_id = 'your-user-id-here';
