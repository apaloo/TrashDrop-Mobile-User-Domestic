-- Function public.admin_remove_staff
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- admin_remove_staff(p_user_id uuid, p_note text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.admin_remove_staff(p_user_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  who text;
BEGIN
  IF NOT public.td_is_staff() THEN
    RAISE EXCEPTION 'Only admins can remove admins' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('td_staff_admins'));
  IF NOT EXISTS (SELECT 1 FROM public.staff_admins WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'That account is not an admin' USING ERRCODE = 'no_data_found';
  END IF;
  IF (SELECT count(*) FROM public.staff_admins) <= 1 THEN
    RAISE EXCEPTION 'The last admin can''t be removed' USING ERRCODE = 'check_violation';
  END IF;
  SELECT email INTO who FROM auth.users WHERE id = p_user_id;
  DELETE FROM public.staff_admins WHERE user_id = p_user_id;
  PERFORM public.td_write_log('warn', 'auth', 'staff.admin_removed', 'user', p_user_id::text,
    format('%s is no longer an admin', coalesce(who, p_user_id::text)),
    jsonb_build_object('admin', true), jsonb_build_object('admin', false),
    jsonb_strip_nulls(jsonb_build_object('note', p_note)));
  RETURN jsonb_build_object('user_id', p_user_id, 'admin', false);
END;
$function$;
