-- Function public.scan_pickup_request_bag
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- scan_pickup_request_bag(p_request_id text, p_batch_id uuid, p_bag_no integer, p_bag_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.scan_pickup_request_bag(p_request_id text, p_batch_id uuid DEFAULT NULL::uuid, p_bag_no integer DEFAULT NULL::integer, p_bag_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_req record;
  v_bag record;
  v_already boolean := false;
  v_payout jsonb;
BEGIN
  IF v_me IS NULL OR NOT public.is_active_collector(v_me) THEN
    RAISE EXCEPTION 'Only registered, active collectors can scan bags' USING ERRCODE = '42501';
  END IF;

  SELECT pr.id::text AS id, pr.user_id, pr.collector_id, pr.status
  INTO v_req
  FROM pickup_requests pr WHERE pr.id::text = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pickup request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.collector_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'This pickup request is not assigned to you' USING ERRCODE = '42501';
  END IF;
  IF v_req.status NOT IN ('accepted', 'en_route', 'arrived', 'collecting') THEN
    RAISE EXCEPTION 'Bags can only be scanned before the pickup is disposed (status is %)', v_req.status
      USING ERRCODE = '22023';
  END IF;

  SELECT x.id, x.batch_id, x.bag_no, x.user_id, x.pickup_request_id, x.price
  INTO v_bag
  FROM (
    SELECT bg.id, bg.batch_id, bg.user_id, bg.pickup_request_id,
           coalesce(bg.unit_price, b.unit_price, 0) AS price,
           row_number() OVER (PARTITION BY bg.batch_id ORDER BY bg.created_at, bg.id) AS bag_no
    FROM bags bg
    LEFT JOIN batches b ON b.id = bg.batch_id
    WHERE (p_bag_id IS NOT NULL AND bg.batch_id = (SELECT batch_id FROM bags WHERE id = p_bag_id))
       OR (p_bag_id IS NULL AND bg.batch_id = p_batch_id)
  ) x
  WHERE (p_bag_id IS NOT NULL AND x.id = p_bag_id)
     OR (p_bag_id IS NULL AND x.bag_no = p_bag_no);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This bag is not in TrashDrop. Check the QR code and try again.' USING ERRCODE = 'P0002';
  END IF;
  IF v_bag.user_id IS DISTINCT FROM v_req.user_id THEN
    RAISE EXCEPTION 'This bag belongs to another household' USING ERRCODE = '42501';
  END IF;
  IF v_bag.pickup_request_id IS NOT NULL AND v_bag.pickup_request_id <> p_request_id THEN
    RAISE EXCEPTION 'This bag was already collected on another pickup' USING ERRCODE = '23505';
  END IF;
  v_already := coalesce(v_bag.pickup_request_id = p_request_id, false);

  IF NOT v_already THEN
    UPDATE bags SET
      scanned = true,
      scanned_at = now(),
      collector_id = v_me,
      pickup_request_id = p_request_id
    WHERE id = v_bag.id;
  END IF;

  v_payout := public.td_apply_prepaid_bag_payout(p_request_id);

  RETURN jsonb_build_object(
    'bag_id', v_bag.id,
    'batch_id', v_bag.batch_id,
    'bag_no', v_bag.bag_no,
    'unit_price', round(v_bag.price, 2),
    'already_scanned', v_already,
    'payout', v_payout);
END;
$function$;
