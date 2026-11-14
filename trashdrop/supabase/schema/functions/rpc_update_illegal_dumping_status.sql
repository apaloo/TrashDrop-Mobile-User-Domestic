-- Function public.rpc_update_illegal_dumping_status
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- rpc_update_illegal_dumping_status(p_report_id uuid, p_status text, p_notes text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.rpc_update_illegal_dumping_status(p_report_id uuid, p_status text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT public.update_illegal_dumping_status(p_report_id, p_status, p_notes);
$function$;
