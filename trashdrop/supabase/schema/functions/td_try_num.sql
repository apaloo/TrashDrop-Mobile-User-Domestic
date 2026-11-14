-- Function public.td_try_num
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_try_num(t text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_try_num(t text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN nullif(btrim(t), '')::numeric;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $function$;
