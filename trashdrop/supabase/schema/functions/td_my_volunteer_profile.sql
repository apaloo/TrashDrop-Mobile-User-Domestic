-- Function public.td_my_volunteer_profile
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_my_volunteer_profile(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_my_volunteer_profile()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT cp.id FROM public.collector_profiles cp
  WHERE auth.uid() IS NOT NULL AND cp.user_id = auth.uid()
    AND cp.collector_type = 'volunteer'
    AND coalesce(cp.status, '') <> 'suspended'
    AND (to_jsonb(cp) ->> 'deactivated_at') IS NULL
    AND public.td_my_role() = 'volunteer'
  LIMIT 1
$function$;
