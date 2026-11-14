-- Function public.td_area_at
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_area_at(p_lat double precision, p_lng double precision): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_area_at(p_lat double precision, p_lng double precision)
 RETURNS TABLE(district text, region text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH p AS (
    SELECT ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326) AS g
    WHERE p_lat BETWEEN 4.5 AND 11.5 AND p_lng BETWEEN -3.5 AND 1.5
  )
  SELECT d.name, d.region
  FROM p, LATERAL (
    SELECT x.name, x.region FROM public.gh_districts x
    WHERE ST_DWithin(x.geom, p.g, 0.02)
    ORDER BY ST_Distance(x.geom, p.g), x.name
    LIMIT 1
  ) d
$function$;
