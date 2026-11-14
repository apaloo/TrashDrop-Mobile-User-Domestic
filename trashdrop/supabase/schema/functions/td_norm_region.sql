-- Function public.td_norm_region
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_norm_region(p text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_norm_region(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT nullif(lower(btrim(regexp_replace(coalesce(p, ''), '\s+region\s*$', '', 'i'))), '')
$function$;
