-- Function public.validate_ghana_coords
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- validate_ghana_coords(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.validate_ghana_coords()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    -- Only validate if coordinates are being set
    IF NEW.coordinates IS NOT NULL THEN
        IF NOT (ST_X(NEW.coordinates::geometry) BETWEEN -3.3 AND 1.2 AND
               ST_Y(NEW.coordinates::geometry) BETWEEN 4.7 AND 11.2) THEN
            RAISE WARNING 'Coordinates (%, %) are outside Ghana boundaries', 
                ST_X(NEW.coordinates::geometry), 
                ST_Y(NEW.coordinates::geometry);
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;
