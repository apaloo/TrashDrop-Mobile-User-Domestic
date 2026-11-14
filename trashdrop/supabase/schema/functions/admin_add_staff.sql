-- Function public.admin_add_staff
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- admin_add_staff(p_email text, p_note text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.admin_add_staff(p_email text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  target uuid;
BEGIN
  IF NOT public.td_is_staff() THEN
    RAISE EXCEPTION 'Only admins can add admins' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT id INTO target FROM auth.users WHERE lower(email) = lower(btrim(coalesce(p_email, '')));
  IF target IS NULL THEN
    RAISE EXCEPTION 'No account with that email' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO public.staff_admins (user_id, added_by, note)
  VALUES (target, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''))
  ON CONFLICT (user_id) DO NOTHING;
  IF FOUND THEN
    PERFORM public.td_write_log('warn', 'auth', 'staff.admin_added', 'user', target::text,
      format('%s made an admin', lower(btrim(p_email))), NULL,
      jsonb_build_object('admin', true), jsonb_strip_nulls(jsonb_build_object('note', p_note)));
  END IF;
  RETURN jsonb_build_object('user_id', target, 'admin', true);
END;
$function$;
