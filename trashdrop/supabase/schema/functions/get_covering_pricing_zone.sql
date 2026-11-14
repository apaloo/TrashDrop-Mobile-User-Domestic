-- Function public.get_covering_pricing_zone
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_covering_pricing_zone(p_latitude double precision, p_longitude double precision): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_covering_pricing_zone(p_latitude double precision, p_longitude double precision)
 RETURNS SETOF pricing_zones
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pz.*
  FROM public.check_service_coverage(p_latitude, p_longitude) c
  JOIN public.pricing_zones pz ON pz.id = c.zone_id
  WHERE c.is_covered;
$function$;
