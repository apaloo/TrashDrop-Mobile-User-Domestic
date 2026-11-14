-- Function public.validate_pickup_request_locations
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- validate_pickup_request_locations(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.validate_pickup_request_locations()
 RETURNS TABLE(pickup_request_id uuid, user_id uuid, current_location text, current_address text, expected_location text, expected_address text, location_mismatch boolean, address_mismatch boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        pr.id AS pickup_request_id,
        pr.user_id,
        pr.location AS current_location,
        pr.address AS current_address,
        CONCAT('POINT(', loc.longitude, ' ', loc.latitude, ')') AS expected_location,
        loc.address AS expected_address,
        (pr.location IS DISTINCT FROM CONCAT('POINT(', loc.longitude, ' ', loc.latitude, ')')) AS location_mismatch,
        (pr.address IS DISTINCT FROM loc.address) AS address_mismatch
    FROM pickup_requests pr
    LEFT JOIN locations loc ON pr.user_id = loc.user_id
    WHERE pr.location IS NOT NULL 
    AND loc.latitude IS NOT NULL 
    AND loc.longitude IS NOT NULL
    AND loc.is_default = true;  -- Only check against default locations
END;
$function$;
