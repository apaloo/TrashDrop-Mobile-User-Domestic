-- Function public.check_service_coverage
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- check_service_coverage(p_latitude double precision, p_longitude double precision): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.check_service_coverage(p_latitude double precision, p_longitude double precision)
 RETURNS TABLE(is_covered boolean, zone_id uuid, region character varying, district character varying, community character varying, suburb character varying, distance_km numeric, service_radius_km numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH distances AS (
    SELECT
      pz.id, pz.region, pz.district, pz.community, pz.suburb, pz.service_radius_km,
      6371 * acos(LEAST(1.0, GREATEST(-1.0,
        cos(radians(p_latitude)) * cos(radians(pz.latitude)) *
        cos(radians(pz.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) * sin(radians(pz.latitude))
      ))) AS dist
    FROM public.pricing_zones pz
    WHERE pz.is_active = true
      AND pz.latitude IS NOT NULL
      AND pz.longitude IS NOT NULL
      AND p_latitude BETWEEN -90 AND 90
      AND p_longitude BETWEEN -180 AND 180
  )
  SELECT
    d.dist <= d.service_radius_km,
    d.id, d.region, d.district, d.community, d.suburb,
    round(d.dist::NUMERIC, 2),
    d.service_radius_km
  FROM distances d
  ORDER BY (d.dist <= d.service_radius_km) DESC, d.dist ASC
  LIMIT 1;
$function$;
