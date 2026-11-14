-- Function public.td_bag_stage_name
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_bag_stage_name(p_rank integer): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_bag_stage_name(p_rank integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT (ARRAY['generated', 'distributed', 'filled', 'collected', 'processed'])[greatest(1, least(5, coalesce(p_rank, 1)))]
$function$;
