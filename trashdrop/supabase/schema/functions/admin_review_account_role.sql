-- Function public.admin_review_account_role
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- admin_review_account_role(p_user_id uuid, p_approve boolean, p_role text, p_note text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.admin_review_account_role(p_user_id uuid, p_approve boolean, p_role text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  cur public.account_roles;
  new_role text;
  who text;
BEGIN
  IF NOT public.can_do('users.manage') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO cur FROM public.account_roles WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found' USING ERRCODE = 'no_data_found'; END IF;
  SELECT email INTO who FROM auth.users WHERE id = p_user_id;
  IF NOT p_approve AND nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Give a reason when rejecting' USING ERRCODE = 'check_violation';
  END IF;
  new_role := CASE WHEN p_approve THEN lower(coalesce(nullif(btrim(p_role), ''), cur.requested_role)) ELSE cur.role END;
  IF new_role NOT IN ('user', 'volunteer', 'media', 'manager', 'authority') THEN
    RAISE EXCEPTION 'Unknown role "%"', p_role USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.account_roles SET
    role = new_role,
    requested_role = CASE WHEN p_approve THEN new_role ELSE requested_role END,
    status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    review_note = nullif(btrim(coalesce(p_note, '')), ''),
    reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE user_id = p_user_id;
  PERFORM public.td_write_log('info', 'auth', CASE WHEN p_approve THEN 'account.role_approved' ELSE 'account.role_rejected' END,
    'user', p_user_id::text,
    format('%s: %s', coalesce(who, p_user_id::text),
           CASE WHEN p_approve THEN 'approved as ' || new_role ELSE cur.requested_role || ' access rejected' END),
    jsonb_build_object('role', cur.role, 'status', cur.status, 'requested_role', cur.requested_role),
    jsonb_build_object('role', new_role, 'status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END),
    jsonb_strip_nulls(jsonb_build_object('note', p_note)));
  -- tell the person (in-app notification), never blocks the review
  BEGIN
    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (p_user_id,
            CASE WHEN p_approve THEN 'Access approved' ELSE 'Access request not approved' END,
            CASE WHEN p_approve THEN format('Your TrashDrop account now has %s access.', new_role)
                 ELSE format('Your request for %s access was not approved: %s', cur.requested_role, p_note) END,
            CASE WHEN p_approve THEN 'success' ELSE 'info' END, false);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $function$;
