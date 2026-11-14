-- Function public.td_log_level
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_log_level(l text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_log_level(l text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT CASE lower(btrim(coalesce(l, 'info')))
    WHEN 'warning' THEN 'warn' WHEN 'warn' THEN 'warn'
    WHEN 'err' THEN 'error' WHEN 'error' THEN 'error'
    WHEN 'fatal' THEN 'critical' WHEN 'critical' THEN 'critical' WHEN 'crit' THEN 'critical'
    WHEN 'debug' THEN 'debug' WHEN 'trace' THEN 'debug'
    ELSE 'info' END
$function$;
