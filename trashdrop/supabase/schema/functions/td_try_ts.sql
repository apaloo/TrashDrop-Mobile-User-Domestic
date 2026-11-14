-- Function public.td_try_ts
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_try_ts(t text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_try_ts(t text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN t::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $function$;
