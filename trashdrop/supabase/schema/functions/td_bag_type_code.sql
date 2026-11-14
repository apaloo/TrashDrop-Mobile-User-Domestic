-- Function public.td_bag_type_code
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_bag_type_code(p_type text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_bag_type_code(p_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT CASE lower(btrim(coalesce(p_type, '')))
    WHEN 'recyclable' THEN 'REC' WHEN 'organic' THEN 'ORG' WHEN 'hazardous' THEN 'HAZ'
    WHEN 'general' THEN 'GEN' WHEN 'electronic' THEN 'ELE' ELSE 'OTH' END
$function$;
