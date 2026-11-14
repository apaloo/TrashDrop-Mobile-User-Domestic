-- Function public.td_my_collector_profile_ids
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_my_collector_profile_ids(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_my_collector_profile_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT cp.id FROM public.collector_profiles cp WHERE auth.uid() IS NOT NULL AND cp.user_id = auth.uid()
$function$;
