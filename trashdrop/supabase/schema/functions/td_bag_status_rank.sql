-- Function public.td_bag_status_rank
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_bag_status_rank(p_status text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_bag_status_rank(p_status text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN v IN ('processed', 'recycled') THEN 5
    WHEN v IN ('collected', 'picked_up', 'disposed', 'completed', 'scanned') THEN 4
    WHEN v IN ('filled', 'used', 'pending', 'requested', 'full') THEN 3
    ELSE 0 END
  FROM (SELECT lower(btrim(coalesce(p_status, ''))) AS v) x
$function$;
