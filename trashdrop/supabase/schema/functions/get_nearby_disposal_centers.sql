-- Function public.get_nearby_disposal_centers
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_nearby_disposal_centers(lat double precision, lng double precision, search_radius integer): execute: service_role
CREATE OR REPLACE FUNCTION public.get_nearby_disposal_centers(lat double precision, lng double precision, search_radius integer DEFAULT 5000)
 RETURNS SETOF disposal_centers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.disposal_centers
  WHERE ST_DWithin(
    coordinates,
    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
    $3
  )
  ORDER BY ST_Distance(
    coordinates,
    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
  );
END;
$function$;
