-- Function public.td_activity_role
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_activity_role(p_user uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.td_activity_role(p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    (SELECT r.role FROM public.account_roles r WHERE r.user_id = p_user AND r.role <> 'user'),
    (SELECT 'collector' FROM public.collector_profiles cp
      WHERE cp.user_id = p_user AND coalesce(to_jsonb(cp) ->> 'collector_type', 'collector') = 'collector' LIMIT 1),
    'user')
$function$;
