-- Function public.standardize_pickup_coordinates
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- standardize_pickup_coordinates(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.standardize_pickup_coordinates()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
$function$;
