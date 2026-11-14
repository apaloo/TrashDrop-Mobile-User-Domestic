-- Function public.td_in_account_area
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_in_account_area(p_role text, p_acc_region text, p_acc_district text, p_region text, p_district text): execute: service_role
CREATE OR REPLACE FUNCTION public.td_in_account_area(p_role text, p_acc_region text, p_acc_district text, p_region text, p_district text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT CASE p_role
    WHEN 'authority' THEN p_acc_district IS NOT NULL AND p_district = p_acc_district
    WHEN 'volunteer' THEN p_acc_region IS NOT NULL AND p_region = p_acc_region
    ELSE false END
$function$;
