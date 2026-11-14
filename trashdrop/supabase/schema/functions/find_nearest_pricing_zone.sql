-- Function public.find_nearest_pricing_zone
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- find_nearest_pricing_zone(p_latitude numeric, p_longitude numeric, p_max_distance_km numeric): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.find_nearest_pricing_zone(p_latitude numeric, p_longitude numeric, p_max_distance_km numeric DEFAULT 10)
 RETURNS TABLE(zone_id uuid, region character varying, district character varying, community character varying, suburb character varying, distance_km numeric, price_50l numeric, price_60l numeric, price_80l numeric, price_90l numeric, price_100l numeric, price_120l numeric, price_240l numeric, price_260l numeric, price_320l numeric, price_340l numeric, price_360l numeric, price_660l numeric, price_1100l numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT * FROM (
    SELECT 
      pz.id AS zone_id,
      pz.region,
      pz.district,
      pz.community,
      pz.suburb,
      (6371 * acos(
        cos(radians(p_latitude)) * cos(radians(pz.latitude)) *
        cos(radians(pz.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) * sin(radians(pz.latitude))
      ))::DECIMAL AS distance_km,
      pz.price_50l,
      pz.price_60l,
      pz.price_80l,
      pz.price_90l,
      pz.price_100l,
      pz.price_120l,
      pz.price_240l,
      pz.price_260l,
      pz.price_320l,
      pz.price_340l,
      pz.price_360l,
      pz.price_660l,
      pz.price_1100l
    FROM public.pricing_zones pz
    WHERE pz.is_active = true
      AND pz.latitude IS NOT NULL
      AND pz.longitude IS NOT NULL
  ) AS zones_with_distance
  WHERE zones_with_distance.distance_km <= p_max_distance_km
  ORDER BY zones_with_distance.distance_km ASC
  LIMIT 1;
END;
$function$;
