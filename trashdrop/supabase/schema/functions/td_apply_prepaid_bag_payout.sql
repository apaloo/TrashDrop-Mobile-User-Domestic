-- Function public.td_apply_prepaid_bag_payout
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_apply_prepaid_bag_payout(p_request_id text, p_tips numeric): execute: service_role
CREATE OR REPLACE FUNCTION public.td_apply_prepaid_bag_payout(p_request_id text, p_tips numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bags jsonb;
  v_count integer;
  v_total numeric;
  v_tips numeric;
  v_n integer;
  v_unit numeric;
  v_model text := 'prepaid_bags';
  v_breakdown jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'bag_id', x.id, 'batch_id', x.batch_id, 'bag_no', x.bag_no, 'unit_price', x.price)
           ORDER BY x.batch_id, x.bag_no), '[]'::jsonb),
         count(*),
         coalesce(sum(x.price), 0)
  INTO v_bags, v_count, v_total
  FROM (
    SELECT bg.id, bg.batch_id, bg.pickup_request_id,
           coalesce(bg.unit_price, b.unit_price, 0) AS price,
           row_number() OVER (PARTITION BY bg.batch_id ORDER BY bg.created_at, bg.id) AS bag_no
    FROM bags bg
    LEFT JOIN batches b ON b.id = bg.batch_id
    WHERE bg.batch_id IN (SELECT batch_id FROM bags WHERE pickup_request_id = p_request_id)
  ) x
  WHERE x.pickup_request_id = p_request_id;

  IF v_count = 0 THEN
    -- nothing scanned: the unit price of the batch of the request, per requested bag
    SELECT greatest(coalesce(pr.estimated_volume, pr.bag_count, 1), 1)::integer,
           coalesce(b.unit_price, pr.fee, 0)
    INTO v_n, v_unit
    FROM pickup_requests pr
    LEFT JOIN batches b ON b.id = pr.batch_id
    WHERE pr.id::text = p_request_id;
    v_total := coalesce(v_n, 1) * coalesce(v_unit, 0);
    v_model := 'prepaid_bags_unscanned';
  END IF;

  SELECT coalesce(p_tips, pr.collector_tips, 0) INTO v_tips
  FROM pickup_requests pr WHERE pr.id::text = p_request_id;

  v_breakdown := jsonb_build_object(
    'model', v_model,
    'bags', v_bags,
    'bags_scanned', v_count,
    'bag_total', round(v_total, 2),
    'tips', round(coalesce(v_tips, 0), 2),
    'total', round(v_total + coalesce(v_tips, 0), 2));

  UPDATE pickup_requests SET
    collector_core_payout = round(v_total, 2),
    collector_urgent_payout = 0,
    collector_distance_payout = 0,
    collector_surge_payout = 0,
    collector_recyclables_payout = 0,
    collector_loyalty_cashback = 0,
    collector_tips = round(coalesce(v_tips, 0), 2),
    collector_total_payout = round(v_total + coalesce(v_tips, 0), 2),
    platform_share = 0,
    payout_breakdown = v_breakdown,
    updated_at = now()
  WHERE id::text = p_request_id;

  RETURN v_breakdown;
END;
$function$;
