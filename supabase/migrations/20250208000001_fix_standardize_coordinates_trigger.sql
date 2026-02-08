-- Fix the buggy standardize_pickup_coordinates trigger
-- The existing trigger incorrectly parses WKT strings, causing "invalid input syntax for type numeric" errors

-- Option 1: Drop the problematic trigger entirely
-- The create_pickup_request RPC function now handles coordinate conversion properly
DROP TRIGGER IF EXISTS trigger_standardize_pickup_coordinates ON pickup_requests;

-- Option 2: Replace the buggy function with a fixed version that uses PostGIS properly
CREATE OR REPLACE FUNCTION standardize_pickup_coordinates()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set coordinates if they are NULL and location is provided
  -- Use proper PostGIS functions instead of string parsing
  IF NEW.coordinates IS NULL AND NEW.location IS NOT NULL THEN
    BEGIN
      -- Use ST_GeogFromText to properly parse WKT strings
      NEW.coordinates := ST_GeogFromText('SRID=4326;' || NEW.location);
    EXCEPTION WHEN OTHERS THEN
      -- If parsing fails, try to extract coordinates manually using regex
      -- and create geography from them
      DECLARE
        lng_text TEXT;
        lat_text TEXT;
        lng_val FLOAT;
        lat_val FLOAT;
      BEGIN
        -- Extract longitude (first number after POINT()
        lng_text := substring(NEW.location from 'POINT\(([^\s]+)\s');
        -- Extract latitude (second number before closing paren)
        lat_text := substring(NEW.location from 'POINT\([^\s]+\s([^\)]+)\)');
        
        IF lng_text IS NOT NULL AND lat_text IS NOT NULL THEN
          lng_val := lng_text::FLOAT;
          lat_val := lat_text::FLOAT;
          NEW.coordinates := ST_SetSRID(ST_MakePoint(lng_val, lat_val), 4326)::geography;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- If all parsing fails, leave coordinates as NULL
        -- The insert will fail due to NOT NULL constraint, 
        -- but at least we won't have a cryptic parsing error
        RAISE WARNING 'Failed to parse location WKT: %', NEW.location;
      END;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger with the fixed function
CREATE TRIGGER trigger_standardize_pickup_coordinates
  BEFORE INSERT ON pickup_requests
  FOR EACH ROW
  EXECUTE FUNCTION standardize_pickup_coordinates();

COMMENT ON FUNCTION standardize_pickup_coordinates() IS 
'Converts WKT location text to PostGIS geography. Uses ST_GeogFromText for proper parsing.';
