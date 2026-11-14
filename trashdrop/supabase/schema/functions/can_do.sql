-- Function public.can_do
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- can_do(p_capability text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.can_do(p_capability text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_any_role(public.td_capability_roles(p_capability))
$function$;
