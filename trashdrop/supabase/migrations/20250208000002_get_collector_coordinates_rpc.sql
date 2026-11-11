-- RPC function to get collector coordinates in WKT format
-- This ensures consistent coordinate format (POINT(lng lat)) across the app

CREATE OR REPLACE FUNCTION get_collector_coordinates_wkt(collector_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_result TEXT;
BEGIN
  -- Get coordinates as WKT text from collector_profiles
  SELECT ST_AsText(current_location::geometry)
  INTO v_result
  FROM collector_profiles
  WHERE user_id = collector_user_id;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_collector_coordinates_wkt TO authenticated;

COMMENT ON FUNCTION get_collector_coordinates_wkt IS 
'Returns collector current_location as WKT text (POINT(lng lat)) for proper coordinate parsing.';
