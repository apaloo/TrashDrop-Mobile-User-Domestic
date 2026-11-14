-- Function public.resync_user_pickup_locations
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- resync_user_pickup_locations(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.resync_user_pickup_locations()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- use OLD or NEW here; e.g. call an internal helper that takes user_id
  PERFORM your_internal_sync_helper(OLD.user_id);
  RETURN NEW;
END;
$function$;

-- resync_user_pickup_locations(p_user_id uuid): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.resync_user_pickup_locations(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE pickup_requests 
    SET 
        location = CONCAT('POINT(', loc.longitude, ' ', loc.latitude, ')'),
        coordinates = ST_SetSRID(ST_MakePoint(CAST(loc.longitude AS NUMERIC), CAST(loc.latitude AS NUMERIC)), 4326),
        address = loc.address
    FROM locations loc
    WHERE pickup_requests.user_id = p_user_id 
    AND pickup_requests.user_id = loc.user_id 
    AND loc.latitude IS NOT NULL 
    AND loc.longitude IS NOT NULL;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$function$;
