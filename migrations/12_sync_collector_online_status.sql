-- Migration to automatically sync collector online status with last_active timestamp
-- This ensures is_online and status fields stay in sync with last_active updates

-- Create function to automatically update online status based on last_active
CREATE OR REPLACE FUNCTION sync_collector_online_status()
RETURNS TRIGGER AS $$
BEGIN
  -- If last_active was just updated and is recent (within last 5 minutes)
  IF NEW.last_active IS NOT NULL AND 
     NEW.last_active > NOW() - INTERVAL '5 minutes' THEN
    -- Set collector as online and active
    NEW.is_online := true;
    NEW.status := CASE 
      WHEN NEW.status = 'busy' THEN 'busy'  -- Preserve busy status if already set
      ELSE 'active' 
    END;
  ELSIF NEW.last_active IS NOT NULL AND 
        NEW.last_active <= NOW() - INTERVAL '5 minutes' THEN
    -- Set collector as offline and inactive if last_active is older than 5 minutes
    NEW.is_online := false;
    NEW.status := 'inactive';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to run before updates on collector_profiles
DROP TRIGGER IF EXISTS trigger_sync_collector_online_status ON collector_profiles;
CREATE TRIGGER trigger_sync_collector_online_status
  BEFORE UPDATE OF last_active ON collector_profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_collector_online_status();

-- Create a stored procedure to manually update collector activity (for app to call)
CREATE OR REPLACE FUNCTION update_collector_activity(
  p_user_id UUID
)
RETURNS TABLE (
  is_online BOOLEAN,
  status TEXT,
  last_active TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  UPDATE collector_profiles
  SET 
    last_active = NOW(),
    is_online = true,
    status = 'active',
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING collector_profiles.is_online, collector_profiles.status, collector_profiles.last_active;
END;
$$ LANGUAGE plpgsql;

-- Fix existing records where last_active is recent but status is wrong
UPDATE collector_profiles
SET 
  is_online = true,
  status = 'active',
  updated_at = NOW()
WHERE 
  last_active > NOW() - INTERVAL '5 minutes'
  AND (is_online = false OR status = 'inactive');

-- Set offline for collectors with old last_active timestamps
UPDATE collector_profiles
SET 
  is_online = false,
  status = 'inactive',
  updated_at = NOW()
WHERE 
  last_active <= NOW() - INTERVAL '5 minutes'
  AND (is_online = true OR status != 'inactive');

-- Create index for performance on last_active queries
CREATE INDEX IF NOT EXISTS idx_collector_profiles_last_active 
ON collector_profiles(last_active DESC);

-- Add comment to document the auto-sync behavior
COMMENT ON TRIGGER trigger_sync_collector_online_status ON collector_profiles IS 
'Automatically syncs is_online and status fields when last_active is updated. 
Collectors are considered online if last_active is within 5 minutes, offline otherwise.';
