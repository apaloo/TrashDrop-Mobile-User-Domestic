-- Migration to automatically sync collector location formats
-- Ensures current_latitude/current_longitude stay in sync with current_location PostGIS field
-- 
-- NOTE: This migration uses GEOMETRY type (not GEOGRAPHY) to match the collector_profiles.current_location column type
-- SRID 4326 = WGS84 coordinate system (standard GPS coordinates)

-- Function to sync lat/lng FROM PostGIS geometry
CREATE OR REPLACE FUNCTION sync_collector_location_from_postgis()
RETURNS TRIGGER AS $$
BEGIN
  -- If current_location PostGIS field is updated, extract lat/lng
  IF NEW.current_location IS NOT NULL AND 
     (OLD.current_location IS NULL OR NEW.current_location != OLD.current_location) THEN
    
    NEW.current_latitude := ST_Y(NEW.current_location::geometry);
    NEW.current_longitude := ST_X(NEW.current_location::geometry);
    NEW.location_updated_at := NOW();
    
    -- Also update last_active since location was updated
    NEW.last_active := NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to sync PostGIS FROM lat/lng
CREATE OR REPLACE FUNCTION sync_collector_location_from_coords()
RETURNS TRIGGER AS $$
BEGIN
  -- If lat/lng are updated but PostGIS is null or different, update PostGIS
  IF NEW.current_latitude IS NOT NULL AND NEW.current_longitude IS NOT NULL THEN
    -- Check if we need to update PostGIS field
    IF OLD.current_latitude IS DISTINCT FROM NEW.current_latitude OR
       OLD.current_longitude IS DISTINCT FROM NEW.current_longitude THEN
      
      NEW.current_location := ST_SetSRID(
        ST_MakePoint(NEW.current_longitude, NEW.current_latitude),
        4326
      )::geometry;
      NEW.location_updated_at := NOW();
      
      -- Also update last_active since location was updated
      NEW.last_active := NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_sync_location_from_postgis ON collector_profiles;
DROP TRIGGER IF EXISTS trigger_sync_location_from_coords ON collector_profiles;

-- Create trigger to sync lat/lng from PostGIS (runs first)
CREATE TRIGGER trigger_sync_location_from_postgis
  BEFORE UPDATE OF current_location ON collector_profiles
  FOR EACH ROW
  WHEN (NEW.current_location IS NOT NULL)
  EXECUTE FUNCTION sync_collector_location_from_postgis();

-- Create trigger to sync PostGIS from lat/lng (runs second)
CREATE TRIGGER trigger_sync_location_from_coords
  BEFORE UPDATE OF current_latitude, current_longitude ON collector_profiles
  FOR EACH ROW
  WHEN (NEW.current_latitude IS NOT NULL AND NEW.current_longitude IS NOT NULL)
  EXECUTE FUNCTION sync_collector_location_from_coords();

-- Fix existing records: Populate lat/lng from PostGIS where PostGIS exists but lat/lng are null
UPDATE collector_profiles
SET 
  current_latitude = ST_Y(current_location::geometry),
  current_longitude = ST_X(current_location::geometry),
  location_updated_at = COALESCE(location_updated_at, updated_at, NOW())
WHERE 
  current_location IS NOT NULL
  AND (current_latitude IS NULL OR current_longitude IS NULL);

-- Fix existing records: Populate PostGIS from lat/lng where lat/lng exist but PostGIS is null
UPDATE collector_profiles
SET 
  current_location = ST_SetSRID(
    ST_MakePoint(current_longitude, current_latitude),
    4326
  )::geometry,
  location_updated_at = COALESCE(location_updated_at, updated_at, NOW())
WHERE 
  current_latitude IS NOT NULL 
  AND current_longitude IS NOT NULL
  AND current_location IS NULL;

-- Create stored procedure to update collector location (both formats)
CREATE OR REPLACE FUNCTION update_collector_location(
  p_user_id UUID,
  p_latitude FLOAT,
  p_longitude FLOAT
)
RETURNS TABLE (
  current_latitude FLOAT,
  current_longitude FLOAT,
  current_location geometry,
  location_updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  UPDATE collector_profiles
  SET 
    current_latitude = p_latitude,
    current_longitude = p_longitude,
    current_location = ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geometry,
    location_updated_at = NOW(),
    last_active = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING 
    collector_profiles.current_latitude, 
    collector_profiles.current_longitude, 
    collector_profiles.current_location,
    collector_profiles.location_updated_at;
END;
$$ LANGUAGE plpgsql;

-- Create index for location queries if not exists
CREATE INDEX IF NOT EXISTS idx_collector_profiles_location 
ON collector_profiles USING GIST (current_location);

CREATE INDEX IF NOT EXISTS idx_collector_profiles_location_updated 
ON collector_profiles(location_updated_at DESC);

-- Add comments
COMMENT ON FUNCTION sync_collector_location_from_postgis() IS 
'Automatically extracts latitude/longitude from PostGIS current_location field when it is updated.';

COMMENT ON FUNCTION sync_collector_location_from_coords() IS 
'Automatically creates PostGIS current_location from latitude/longitude fields when they are updated.';

COMMENT ON FUNCTION update_collector_location(UUID, FLOAT, FLOAT) IS 
'Updates collector location in both PostGIS and lat/lng formats. Call from app: SELECT * FROM update_collector_location(user_id, lat, lng);';

-- Verification query (run this to check results)
-- SELECT 
--   user_id,
--   first_name,
--   current_latitude,
--   current_longitude,
--   current_location,
--   location_updated_at,
--   ST_Y(current_location::geometry) as postgis_lat,
--   ST_X(current_location::geometry) as postgis_lng
-- FROM collector_profiles
-- WHERE current_location IS NOT NULL
-- LIMIT 5;
