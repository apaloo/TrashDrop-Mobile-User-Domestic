-- Function public.td_bag_stage_rank
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_bag_stage_rank(p_stage text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_bag_stage_rank(p_stage text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT CASE p_stage WHEN 'generated' THEN 1 WHEN 'distributed' THEN 2 WHEN 'filled' THEN 3
                      WHEN 'collected' THEN 4 WHEN 'processed' THEN 5 ELSE 0 END
$function$;
