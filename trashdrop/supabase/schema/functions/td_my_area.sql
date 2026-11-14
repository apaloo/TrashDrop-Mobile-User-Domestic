-- Function public.td_my_area
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_my_area(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_my_area()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT public.td_my_role() AS role,
           (SELECT d.region FROM public.gh_districts d WHERE d.region = ar.region LIMIT 1) AS region,
           (SELECT d.name FROM public.gh_districts d WHERE d.name = ar.district AND d.region = ar.region) AS district
    FROM (SELECT 1) one
    LEFT JOIN public.account_roles ar ON ar.user_id = public.td_effective_account(auth.uid())
  )
  SELECT CASE
    WHEN role IN ('admin', 'manager', 'media') THEN jsonb_build_object('level', 'national', 'role', role)
    WHEN role = 'authority' AND district IS NOT NULL THEN jsonb_build_object('level', 'district', 'role', role, 'region', region, 'district', district)
    WHEN role = 'volunteer' AND region IS NOT NULL THEN jsonb_build_object('level', 'region', 'role', role, 'region', region)
    ELSE jsonb_build_object('level', 'none', 'role', role)
  END
  FROM me
$function$;
