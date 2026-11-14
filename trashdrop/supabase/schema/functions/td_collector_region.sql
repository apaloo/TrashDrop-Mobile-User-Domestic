-- Function public.td_collector_region
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_collector_region(p_ref text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_collector_region(p_ref text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(nullif(btrim(cp.region), ''), nullif(btrim(cp.assigned_region), ''))
  FROM public.collector_profiles cp
  WHERE cp.user_id::text = p_ref OR cp.id::text = p_ref
  ORDER BY (cp.user_id::text = p_ref) DESC
  LIMIT 1
$function$;
