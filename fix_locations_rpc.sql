-- Fix add_user_location RPC function to match actual locations table schema
-- This fixes the error: column "name" of relation "locations" does not exist

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
    user_id, 
    location_name,  -- Fixed: was "name"
    address, 
    latitude,      -- Fixed: was "coordinates" 
    longitude,     -- Fixed: was "coordinates"
    is_default
  )
  VALUES (
    user_uuid, 
    name, 
    address, 
    lat,           -- Fixed: Use latitude directly
    lng,           -- Fixed: Use longitude directly  
    true
  )
  RETURNING id INTO loc_id;

  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'location_added', 'User added location');

  RETURN loc_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION add_user_location TO authenticated;
