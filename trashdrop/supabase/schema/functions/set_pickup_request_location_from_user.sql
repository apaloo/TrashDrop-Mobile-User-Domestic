-- Function public.set_pickup_request_location_from_user
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- set_pickup_request_location_from_user(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.set_pickup_request_location_from_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_lat double precision;
  v_lon double precision;
BEGIN
  IF NEW.location IS NOT NULL AND NEW.coordinates IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.latitude::double precision, l.longitude::double precision
    INTO STRICT v_lat, v_lon
  FROM locations l
  WHERE l.user_id = NEW.user_id
  ORDER BY l.is_default DESC, l.updated_at DESC
  LIMIT 1;

  NEW.location    := ST_SetSRID(ST_MakePoint(v_lon, v_lat), 4326);              -- POINT(lon lat)
  NEW.coordinates := ST_SetSRID(ST_MakePoint(v_lon, v_lat), 4326)::geography;   -- geography

  RETURN NEW;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RETURN NEW;
END;
$function$;
