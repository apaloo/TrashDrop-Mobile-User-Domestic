-- Function public.td_https_links
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_https_links(v jsonb): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_https_links(v jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT CASE WHEN jsonb_typeof(v) = 'array' THEN
    coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements_text(v) x WHERE x ILIKE 'https://%'), '[]'::jsonb)
  ELSE '[]'::jsonb END
$function$;
