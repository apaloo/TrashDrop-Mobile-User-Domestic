-- Function public.generate_location_hash
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- generate_location_hash(lat numeric, lng numeric, tolerance_meters integer): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.generate_location_hash(lat numeric, lng numeric, tolerance_meters integer DEFAULT 50)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    -- Convert coordinates to grid cells based on tolerance
    -- This creates a hash that will be the same for nearby locations
    RETURN CONCAT(
        ROUND(lat::NUMERIC * 1000000 / tolerance_meters)::TEXT,
        ',',
        ROUND(lng::NUMERIC * 1000000 / tolerance_meters)::TEXT
    );
END;
$function$;
