-- Migration: Add bag_id support to create_pickup_request RPC function
-- This allows linking a specific bag to a pickup request for collector app integration

-- Drop the old function signatures
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,double precision,double precision,integer);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,double precision,double precision,integer,text);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,double precision,double precision,integer,text,uuid);

-- Create updated function with optional bag_id parameter
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
  p_address TEXT DEFAULT NULL,
  p_bag_id UUID DEFAULT NULL
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
  created_at TIMESTAMPTZ,
  bag_id UUID
) AS $$
DECLARE
  v_location TEXT;
  v_coordinates GEOGRAPHY;
BEGIN
  -- Create WKT format location string as POINT(longitude latitude)
  v_location := 'POINT(' || p_longitude || ' ' || p_latitude || ')';
  
  -- Create geography from coordinates using ST_GeogFromText
  v_coordinates := ST_GeogFromText('SRID=4326;' || v_location);
  
  -- Insert the pickup request with optional bag_id
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
    bag_id,
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
    p_bag_id,
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
    pickup_requests.created_at,
    pickup_requests.bag_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_pickup_request TO authenticated;

COMMENT ON FUNCTION create_pickup_request IS 
'Creates a pickup request with proper geography handling and optional bag_id linking.
Parameters:
  p_id: Pickup request ID (TEXT)
  p_user_id: User UUID
  p_status: Pickup status (e.g., pending)
  p_bag_count: Number of bags (stored in estimated_volume)
  p_waste_type: Type of waste
  p_special_instructions: User notes
  p_longitude: Longitude coordinate
  p_latitude: Latitude coordinate
  p_fee: Pickup fee (default 0)
  p_address: Human-readable address (optional)
  p_bag_id: Optional bag UUID to link to this pickup request';
