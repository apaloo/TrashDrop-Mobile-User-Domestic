-- Function public.sync_collector_location_from_coords
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- sync_collector_location_from_coords(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.sync_collector_location_from_coords()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
$function$;
