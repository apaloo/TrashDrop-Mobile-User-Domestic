-- Function public.get_user_emails
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_user_emails(user_ids uuid[]): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_user_emails(user_ids uuid[])
 RETURNS TABLE(id uuid, email text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT au.id, au.email::text
  FROM auth.users au
  WHERE au.id = ANY(user_ids)
    AND (public.td_can_manage_requests() OR auth.role() = 'service_role' OR au.id = auth.uid());
$function$;
