-- TD10, steps 1-3 (owner's approval 2026-11-12: "yes, apply to production").
-- Admins are recorded in a table instead of only in database code.
-- 1. staff_admins: who is an admin, who added them, when, why. Only admins
--    can read it; it changes only through the two functions below, which
--    write every change to the audit log and refuse to remove the last admin.
-- 2. admin_add_staff / admin_remove_staff, for the admin site.
-- 3. td_is_staff() accepts the email list (td_admin_emails) OR the table
--    while the switch-over is checked; the current admins are copied into
--    the table, so nobody's access changes. Retiring the email list is a
--    separate change.

CREATE TABLE IF NOT EXISTS public.staff_admins (
  user_id   uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  added_by  uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  added_at  timestamptz NOT NULL DEFAULT now(),
  note      text
);
ALTER TABLE public.staff_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_admins FROM anon, authenticated;
GRANT SELECT ON public.staff_admins TO authenticated;
DROP POLICY IF EXISTS staff_admins_read ON public.staff_admins;
CREATE POLICY staff_admins_read ON public.staff_admins FOR SELECT TO authenticated
  USING (public.td_is_staff());

-- Current admins, from the email list
INSERT INTO public.staff_admins (user_id, note)
SELECT u.id, 'copied from the admin email list (TD10)'
FROM auth.users u
WHERE lower(u.email) = ANY (public.td_admin_emails())
ON CONFLICT (user_id) DO NOTHING;

-- Staff: the email list or the table. Runs with its owner's rights so it can
-- read staff_admins whatever the caller's row-level security.
CREATE OR REPLACE FUNCTION public.td_is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT coalesce(lower(auth.jwt() ->> 'email') = ANY (public.td_admin_emails()), false)
      OR (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.staff_admins s WHERE s.user_id = auth.uid()))
$function$;

CREATE OR REPLACE FUNCTION public.admin_add_staff(p_email text, p_note text DEFAULT NULL)
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

CREATE OR REPLACE FUNCTION public.admin_remove_staff(p_user_id uuid, p_note text DEFAULT NULL)
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

REVOKE EXECUTE ON FUNCTION public.admin_add_staff(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_remove_staff(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_staff(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_staff(uuid, text) TO authenticated;
