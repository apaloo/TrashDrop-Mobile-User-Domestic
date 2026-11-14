-- Function public.get_whatsapp_guest_user_id
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_whatsapp_guest_user_id(): execute: service_role
CREATE OR REPLACE FUNCTION public.get_whatsapp_guest_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT u.id FROM auth.users u
  WHERE u.email = 'whatsapp-guest@trashdrops.com'
  LIMIT 1;
$function$;
