-- Function public.td_request_group
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_request_group(p_status text, p_collector text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_request_group(p_status text, p_collector text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN c = 'pending' AND nullif(btrim(coalesce(p_collector, '')), '') IS NULL THEN 'pending'
    WHEN c IN ('pending', 'accepted') THEN 'assigned'
    WHEN c IN ('en_route', 'arrived', 'collecting') THEN 'in_progress'
    WHEN c = 'disposed' THEN 'completed'
    WHEN c IN ('cancelled', 'expired') THEN 'cancelled'
    ELSE 'other' END
  FROM (SELECT public.td_canon_status(p_status) AS c) x
$function$;
