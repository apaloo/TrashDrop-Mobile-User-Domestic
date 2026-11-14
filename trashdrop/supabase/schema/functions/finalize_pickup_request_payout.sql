-- Function public.finalize_pickup_request_payout
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- finalize_pickup_request_payout(p_request_id text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.finalize_pickup_request_payout(p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_collector uuid;
  v_tips numeric := 0;
BEGIN
  IF v_me IS NULL OR NOT public.is_active_collector(v_me) THEN
    RAISE EXCEPTION 'Only registered, active collectors can do this' USING ERRCODE = '42501';
  END IF;

  SELECT pr.collector_id INTO v_collector FROM pickup_requests pr WHERE pr.id::text = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pickup request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_collector IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'This pickup request is not assigned to you' USING ERRCODE = '42501';
  END IF;

  BEGIN
    SELECT coalesce(sum(t.amount), 0) INTO v_tips
    FROM collector_tips t
    WHERE t.collector_id = v_me AND t.request_id::text = p_request_id AND t.status = 'confirmed';
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_tips := 0;
  END;

  RETURN public.td_apply_prepaid_bag_payout(p_request_id, v_tips);
END;
$function$;
