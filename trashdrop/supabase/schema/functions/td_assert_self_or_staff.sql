-- Function public.td_assert_self_or_staff
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_assert_self_or_staff(p_user uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_assert_self_or_staff(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN;
  END IF;
  IF auth.uid() IS NOT NULL AND (p_user = auth.uid() OR public.td_can_manage_requests()) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'Not allowed for this account' USING ERRCODE = '42501';
END;
$function$;
