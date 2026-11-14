-- Function public.td_in_my_area
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_in_my_area(p_region text, p_district text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_in_my_area(p_region text, p_district text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE a ->> 'level'
    WHEN 'national' THEN true
    WHEN 'region' THEN p_region IS NOT NULL AND p_region = a ->> 'region'
    WHEN 'district' THEN p_district IS NOT NULL AND p_district = a ->> 'district'
    ELSE false
  END
  FROM (SELECT public.td_my_area() AS a) x
$function$;
