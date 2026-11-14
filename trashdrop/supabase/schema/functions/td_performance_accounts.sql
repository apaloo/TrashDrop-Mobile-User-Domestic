-- Function public.td_performance_accounts
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_performance_accounts(): execute: service_role
CREATE OR REPLACE FUNCTION public.td_performance_accounts()
 RETURNS TABLE(account_id uuid, role text, region text, district text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ar.user_id, ar.role, ar.region, ar.district
  FROM public.account_roles ar
  WHERE ar.role IN ('volunteer', 'media', 'manager', 'authority', 'user')
$function$;
