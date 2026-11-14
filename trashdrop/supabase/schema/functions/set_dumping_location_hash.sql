-- Function public.set_dumping_location_hash
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- set_dumping_location_hash(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.set_dumping_location_hash()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    -- Extract coordinates from geometry type (PostGIS Point)
    -- Handle both direct lat/lng columns and coordinates geometry
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location_hash = generate_location_hash(
            NEW.latitude, 
            NEW.longitude, 
            50 -- 50 meter tolerance for duplicate detection
        );
    ELSIF NEW.coordinates IS NOT NULL THEN
        -- Extract coordinates from geometry if available
        NEW.location_hash = generate_location_hash(
            ST_Y(NEW.coordinates::geometry), 
            ST_X(NEW.coordinates::geometry), 
            50
        );
        -- Also set lat/lng if not already set
        IF NEW.latitude IS NULL THEN
            NEW.latitude = ST_Y(NEW.coordinates::geometry);
        END IF;
        IF NEW.longitude IS NULL THEN
            NEW.longitude = ST_X(NEW.coordinates::geometry);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$;
