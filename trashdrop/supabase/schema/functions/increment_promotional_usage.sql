-- Function public.increment_promotional_usage
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- increment_promotional_usage(p_user_id uuid): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.increment_promotional_usage(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce((SELECT u.used_count < u.max_requests
                   FROM public.promotional_usage u
                   WHERE u.user_id = p_user_id AND p_user_id = auth.uid()), false)
$function$;
