-- Function public.td_access_email_claim
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_access_email_claim(p_limit integer): execute: service_role
CREATE OR REPLACE FUNCTION public.td_access_email_claim(p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_keys text[];
  v_decisions jsonb;
BEGIN
  INSERT INTO public.td_access_decision_emails (user_id, reviewed_at)
  SELECT r.user_id, r.reviewed_at
    FROM public.account_roles r
   WHERE r.reviewed_at IS NOT NULL AND r.status IN ('approved', 'rejected')
  ON CONFLICT DO NOTHING;

  UPDATE public.td_access_decision_emails e
     SET status = 'skipped'
   WHERE e.status = 'pending'
     AND NOT EXISTS (
       SELECT 1 FROM public.account_roles r
        WHERE r.user_id = e.user_id AND r.reviewed_at = e.reviewed_at
          AND r.status IN ('approved', 'rejected'));

  WITH picked AS (
    SELECT e.user_id, e.reviewed_at
      FROM public.td_access_decision_emails e
     WHERE e.status = 'pending'
       AND e.attempts < 5
       AND (e.last_attempt_at IS NULL OR e.last_attempt_at < now() - interval '2 minutes')
     ORDER BY e.created_at
     LIMIT greatest(1, least(coalesce(p_limit, 10), 50))
       FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.td_access_decision_emails e
       SET attempts = e.attempts + 1, last_attempt_at = now()
      FROM picked
     WHERE e.user_id = picked.user_id AND e.reviewed_at = picked.reviewed_at
    RETURNING e.user_id, e.reviewed_at
  )
  SELECT array_agg(claimed.user_id::text || '/' || claimed.reviewed_at::text) INTO v_keys FROM claimed;

  IF v_keys IS NULL THEN
    RETURN jsonb_build_object('decisions', '[]'::jsonb);
  END IF;

  -- Only what the email needs: the person's own address and first name, the
  -- outcome, and the reviewer's note (which the person already sees in the app).
  SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
    INTO v_decisions
    FROM (
      SELECT r.user_id,
             r.reviewed_at,
             u.email,
             nullif(btrim(coalesce(u.raw_user_meta_data ->> 'firstName', '')), '') AS first_name,
             r.status AS decision,
             r.role,
             r.requested_role,
             r.review_note AS note
        FROM public.account_roles r
        JOIN auth.users u ON u.id = r.user_id
       WHERE r.user_id::text || '/' || r.reviewed_at::text = ANY (v_keys)
    ) d;

  RETURN jsonb_build_object('decisions', v_decisions);
END;
$function$;
