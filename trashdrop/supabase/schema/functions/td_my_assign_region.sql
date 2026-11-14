-- Function public.td_my_assign_region
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_my_assign_region(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_my_assign_region()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.td_is_staff() THEN '*'
    WHEN public.td_my_role() = 'manager' THEN (
      SELECT ar.region FROM public.account_roles ar
      WHERE ar.user_id = auth.uid()
        AND lower(coalesce(ar.company_type, '')) = 'waste_management'
        AND public.td_norm_region(ar.region) IS NOT NULL)
    ELSE NULL END
$function$;
