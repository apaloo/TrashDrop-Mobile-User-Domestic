-- RPC function to create pickup requests with proper geography handling
-- This bypasses the buggy standardize_pickup_coordinates trigger by directly
-- setting the coordinates using ST_GeogFromText
-- 
-- NOTE: bag_count and points_earned are GENERATED ALWAYS AS IDENTITY columns
-- and cannot be inserted into directly. We store the requested bag count in
-- estimated_volume as a workaround.

DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,double precision,double precision,integer);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,double precision,double precision,integer,text);

CREATE OR REPLACE FUNCTION create_pickup_request(
  p_id TEXT,
  p_user_id UUID,
  p_status TEXT,
  p_bag_count INTEGER,
  p_waste_type TEXT,
  p_special_instructions TEXT,
  p_longitude FLOAT,
  p_latitude FLOAT,
  p_fee INTEGER DEFAULT 0,
  p_address TEXT DEFAULT NULL
)
RETURNS TABLE (
  id TEXT,
  user_id UUID,
  status TEXT,
  waste_type TEXT,
  special_instructions TEXT,
  location TEXT,
  coordinates GEOGRAPHY,
  fee INTEGER,
  estimated_volume NUMERIC,
  address TEXT,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_location TEXT;
  v_coordinates GEOGRAPHY;
BEGIN
  -- Create WKT format location string as POINT(latitude longitude)
  -- This matches how the app expects to parse coordinates
  v_location := 'POINT(' || p_latitude || ' ' || p_longitude || ')';
  
  -- Create geography from coordinates using ST_SetSRID and ST_MakePoint
  -- ST_MakePoint uses standard (longitude, latitude) order
  v_coordinates := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography;
  
  -- Insert the pickup request
  -- Note: bag_count is GENERATED ALWAYS AS IDENTITY, so we use estimated_volume instead
  RETURN QUERY
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
    created_at,
    updated_at
  )
  VALUES (
    p_id,
    p_user_id,
    p_status,
    p_waste_type,
    p_special_instructions,
    v_location,
    v_coordinates,
    p_fee,
    p_bag_count::NUMERIC,
    p_address,
    NOW(),
    NOW()
  )
  RETURNING 
    pickup_requests.id,
    pickup_requests.user_id,
    pickup_requests.status,
    pickup_requests.waste_type,
    pickup_requests.special_instructions,
    pickup_requests.location,
    pickup_requests.coordinates,
    pickup_requests.fee,
    pickup_requests.estimated_volume,
    pickup_requests.address,
    pickup_requests.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_pickup_request TO authenticated;

COMMENT ON FUNCTION create_pickup_request IS 
'Creates a pickup request with proper geography handling. Bypasses buggy WKT parsing in triggers.
Usage: SELECT * FROM create_pickup_request(id, user_id, status, bag_count, waste_type, instructions, longitude, latitude, fee);';
