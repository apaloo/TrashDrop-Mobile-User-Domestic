-- Function public.td_my_role
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_my_role(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.td_is_staff() THEN 'admin'
    ELSE coalesce(
      (SELECT r.role FROM public.account_roles r WHERE r.user_id = auth.uid() AND r.role <> 'user'),
      (SELECT g.role FROM public.account_roles g WHERE g.user_id = public.td_team_of(auth.uid())),
      'user') END
$function$;
