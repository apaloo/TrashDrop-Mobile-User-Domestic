-- Function public.has_any_role
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- has_any_role(p_roles text[]): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.has_any_role(p_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(public.td_my_role() = ANY (p_roles), false)
$function$;
