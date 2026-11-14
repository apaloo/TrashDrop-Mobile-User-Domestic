-- Function public.td_can_read_media_data
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_can_read_media_data(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_can_read_media_data()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND public.td_my_role() IN ('media', 'manager', 'admin', 'authority', 'volunteer')
$function$;
