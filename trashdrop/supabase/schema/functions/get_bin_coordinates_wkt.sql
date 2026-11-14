-- Function public.get_bin_coordinates_wkt
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_bin_coordinates_wkt(bin_location_id uuid): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_bin_coordinates_wkt(bin_location_id uuid)
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT ST_AsText(coordinates) FROM bin_locations WHERE id = bin_location_id;
$function$;
