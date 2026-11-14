-- Function public.td_changed_columns
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_changed_columns(o jsonb, n jsonb): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_changed_columns(o jsonb, n jsonb)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT coalesce(array_agg(k ORDER BY k), '{}')
  FROM (SELECT jsonb_object_keys(o) AS k UNION SELECT jsonb_object_keys(n)) keys
  WHERE (o -> k) IS DISTINCT FROM (n -> k)
$function$;
