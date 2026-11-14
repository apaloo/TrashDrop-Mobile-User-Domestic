-- Function public.get_request_coordinates_wkt
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_request_coordinates_wkt(request_id text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_request_coordinates_wkt(request_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  result TEXT;
BEGIN
  SELECT ST_AsText(coordinates)
  INTO result
  FROM pickup_requests
  WHERE id = request_id;
  
  RETURN result;
END;
$function$;
