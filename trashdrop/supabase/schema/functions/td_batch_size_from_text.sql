-- Function public.td_batch_size_from_text
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_batch_size_from_text(p_notes text, p_name text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_batch_size_from_text(p_notes text, p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT nullif(nullif(nullif(btrim(coalesce(
    substring(p_notes FROM 'Size:\s*([^,]+)'),
    CASE WHEN p_name LIKE '% - %' THEN split_part(p_name, ' - ', 2) END)), ''), 'Unknown'), 'Standard')
$function$;
