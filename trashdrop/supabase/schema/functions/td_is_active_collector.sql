-- Function public.td_is_active_collector
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_is_active_collector(p_user_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_is_active_collector(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.collector_profiles cp
    WHERE cp.user_id = p_user_id
      AND coalesce(cp.status, '') <> 'suspended'
      AND (to_jsonb(cp) ->> 'deactivated_at') IS NULL
      AND cp.collector_type = 'collector'
  )
$function$;
