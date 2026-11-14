-- Function public.td_in_scope
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_in_scope(p_scope jsonb, p_region text, p_district text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_in_scope(p_scope jsonb, p_region text, p_district text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT CASE p_scope ->> 'level'
    WHEN 'national' THEN true
    WHEN 'region' THEN p_region IS NOT NULL AND p_region = p_scope ->> 'region'
    WHEN 'district' THEN p_district IS NOT NULL AND p_district = p_scope ->> 'district'
    ELSE false END
$function$;
