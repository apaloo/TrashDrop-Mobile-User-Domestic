-- Function public.td_supported_country
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_supported_country(p_lat double precision, p_lng double precision): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_supported_country(p_lat double precision, p_lng double precision)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_lat IS NULL OR p_lng IS NULL THEN NULL
    WHEN p_lat BETWEEN 4.5 AND 11.2 AND p_lng BETWEEN -3.3 AND 1.2 THEN 'GH'
    WHEN p_lat BETWEEN 4.3 AND 8.6 AND p_lng BETWEEN -11.5 AND -7.35 THEN 'LR'
  END
$function$;
