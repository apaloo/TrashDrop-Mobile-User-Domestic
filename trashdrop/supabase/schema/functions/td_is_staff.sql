-- Function public.td_is_staff
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_is_staff(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select auth.uid() is not null
     and exists (select 1 from public.staff_admins s where s.user_id = auth.uid())
$function$;
