-- Function public.td_num
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_num(v text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_num(v text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$ SELECT CASE WHEN v ~ '^\s*-?\d+(\.\d+)?\s*$' THEN v::numeric END $function$;
