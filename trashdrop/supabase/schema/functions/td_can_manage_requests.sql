-- Function public.td_can_manage_requests
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_can_manage_requests(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_can_manage_requests()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND public.td_my_role() IN ('admin', 'manager')
$function$;
