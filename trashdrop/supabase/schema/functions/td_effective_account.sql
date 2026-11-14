-- Function public.td_effective_account
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_effective_account(p_user uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.td_effective_account(p_user uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(public.td_team_of(p_user), p_user)
$function$;
