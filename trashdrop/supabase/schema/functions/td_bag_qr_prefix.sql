-- Function public.td_bag_qr_prefix
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_bag_qr_prefix(p_type text, p_size text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_bag_qr_prefix(p_type text, p_size text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT CASE WHEN nullif(btrim(p_type), '') IS NULL THEN NULL ELSE
    'TD-' || CASE lower(btrim(p_type))
      WHEN 'recyclable' THEN 'REC' WHEN 'organic' THEN 'ORG' WHEN 'hazardous' THEN 'HAZ'
      WHEN 'general' THEN 'GEN' WHEN 'electronic' THEN 'ELE' ELSE 'OTH' END
    || '-' || CASE lower(btrim(coalesce(p_size, '')))
      WHEN 'small' THEN 'S' WHEN 'large' THEN 'L' ELSE 'M' END
  END
$function$;
