-- Function public.td_role_for_company_type
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_role_for_company_type(p_company_type text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_role_for_company_type(p_company_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT CASE lower(btrim(coalesce(p_company_type, '')))
    WHEN 'waste_management' THEN 'manager'
    WHEN 'recycling' THEN 'manager'
    WHEN 'municipality' THEN 'authority'
    WHEN 'volunteer_group' THEN 'volunteer'
    WHEN 'nonprofit' THEN 'volunteer'
    WHEN 'media' THEN 'media'
    ELSE 'user' END
$function$;
