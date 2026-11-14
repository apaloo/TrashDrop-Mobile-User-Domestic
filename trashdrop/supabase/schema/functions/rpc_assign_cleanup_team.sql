-- Function public.rpc_assign_cleanup_team
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- rpc_assign_cleanup_team(p_report_id uuid, p_collector_id uuid): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.rpc_assign_cleanup_team(p_report_id uuid, p_collector_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT public.assign_cleanup_team(p_report_id, p_collector_id);
$function$;
