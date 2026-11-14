-- Function public.td_pickup_email_claim
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_pickup_email_claim(p_limit integer): execute: service_role
CREATE OR REPLACE FUNCTION public.td_pickup_email_claim(p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_recipients jsonb;
  v_keys text[];
  v_requests jsonb;
BEGIN
  INSERT INTO public.td_pickup_email_alerts (source, request_id)
  SELECT 'pickup_requests', p.id::text FROM public.pickup_requests p
  ON CONFLICT DO NOTHING;
  INSERT INTO public.td_pickup_email_alerts (source, request_id)
  SELECT 'digital_bins', b.id::text FROM public.digital_bins b
  ON CONFLICT DO NOTHING;

  SELECT jsonb_agg(u.email)
    INTO v_recipients
    FROM public.td_pickup_email_recipients r
    JOIN auth.users u ON u.id = r.user_id
   WHERE u.email IS NOT NULL;

  -- No recipients yet: keep everything pending and use up no attempts.
  IF v_recipients IS NULL THEN
    RETURN jsonb_build_object('recipients', '[]'::jsonb, 'requests', '[]'::jsonb);
  END IF;

  WITH picked AS (
    SELECT a.source, a.request_id
      FROM public.td_pickup_email_alerts a
     WHERE a.status = 'pending'
       AND a.attempts < 5
       AND (a.last_attempt_at IS NULL OR a.last_attempt_at < now() - interval '2 minutes')
     ORDER BY a.created_at
     LIMIT greatest(1, least(coalesce(p_limit, 10), 50))
       FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.td_pickup_email_alerts a
       SET attempts = a.attempts + 1, last_attempt_at = now()
      FROM picked
     WHERE a.source = picked.source AND a.request_id = picked.request_id
    RETURNING a.source, a.request_id
  )
  SELECT array_agg(claimed.source || '/' || claimed.request_id) INTO v_keys FROM claimed;

  IF v_keys IS NULL THEN
    RETURN jsonb_build_object('recipients', v_recipients, 'requests', '[]'::jsonb);
  END IF;

  -- The same view the Requests page reads. Customer name and contact details
  -- are not selected, so they never reach an inbox.
  SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
    INTO v_requests
    FROM (
      SELECT v.source, v.id AS request_id, v.created_at, v.address, v.waste_type,
             v.bag_count, v.bin_size_liters, v.fee, v.is_urgent, v.scheduled_date
        FROM public.admin_pickup_requests v
       WHERE v.source || '/' || v.id = ANY (v_keys)
    ) d;

  RETURN jsonb_build_object('recipients', v_recipients, 'requests', v_requests);
END;
$function$;
