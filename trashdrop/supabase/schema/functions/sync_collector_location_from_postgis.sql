-- Function public.sync_collector_location_from_postgis
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- sync_collector_location_from_postgis(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.sync_collector_location_from_postgis()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- When current_location changes, keep latitude/longitude in step
  IF NEW.current_location IS NOT NULL
     AND (OLD.current_location IS NULL
          OR ST_AsEWKB(NEW.current_location) IS DISTINCT FROM ST_AsEWKB(OLD.current_location)) THEN
    NEW.current_latitude := ST_Y(NEW.current_location::geometry);
    NEW.current_longitude := ST_X(NEW.current_location::geometry);
    NEW.location_updated_at := NOW();
    NEW.last_active := NOW();
  END IF;
  RETURN NEW;
END;
$function$;
