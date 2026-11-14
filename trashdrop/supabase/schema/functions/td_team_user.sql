-- Function public.td_team_user
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_team_user(p_profile uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.td_team_user(p_profile uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT cp.user_id::uuid FROM public.collector_profiles cp WHERE cp.id::text = p_profile::text LIMIT 1
$function$;
