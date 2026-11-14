-- Function public.td_withdrawable_items
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_withdrawable_items(p_collector_id uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.td_withdrawable_items(p_collector_id uuid)
 RETURNS TABLE(item_type text, item_id text, amount numeric, earned_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH in_withdrawals AS (
    SELECT wi.item_type, wi.item_id
    FROM public.withdrawal_items wi
    JOIN public.withdrawals w ON w.id = wi.withdrawal_id
    WHERE w.status NOT IN ('failed', 'cancelled')
  )
  -- A: digital bins: client payments confirmed by the gateway or an admin
  --    (TD53), at most the bin's stored payout
  SELECT 'digital_bin'::text, db.id::text,
         least(sum(bp.collector_share), coalesce(max(db.collector_total_payout), 0)),
         max(coalesce(db.updated_at, bp.created_at))
  FROM public.bin_payments bp
  JOIN public.digital_bins db ON db.id = bp.digital_bin_id
  WHERE db.collector_id = p_collector_id
    AND db.status = 'disposed'
    AND bp.type = 'collection'
    AND bp.status = 'success'
    AND bp.confirmed_by IN ('gateway', 'staff')
    AND bp.payment_mode IN ('momo', 'e_cash')
    AND db.id::text NOT IN (SELECT i.item_id FROM in_withdrawals i WHERE i.item_type = 'digital_bin')
    AND db.id NOT IN (
      SELECT bp2.digital_bin_id FROM public.bin_payments bp2
      WHERE bp2.type = 'disbursement' AND bp2.status = 'success' AND bp2.digital_bin_id IS NOT NULL
    )
  GROUP BY db.id
  HAVING least(sum(bp.collector_share), coalesce(max(db.collector_total_payout), 0)) > 0

  UNION ALL
  -- B: pickup requests (prepaid, fixed fee)
  SELECT 'pickup_request'::text, pr.id::text, pr.collector_total_payout, coalesce(pr.disposed_at, pr.updated_at)
  FROM public.pickup_requests pr
  WHERE pr.collector_id = p_collector_id
    AND pr.status = 'disposed'
    AND pr.collector_total_payout > 0
    AND pr.id::text NOT IN (SELECT i.item_id FROM in_withdrawals i WHERE i.item_type = 'pickup_request')

  UNION ALL
  -- C: illegal dumping cleanups paid by TrashDrop, disposed. Cleanups an MMDA
  --    assigned are paid by the MMDA directly and only recorded here.
  SELECT 'dumping_cleanup'::text, v.id::text, v.payment, coalesce(v.disposed_at, v.updated_at)
  FROM public.collector_assignments_view v
  WHERE v.collector_id = p_collector_id
    AND v.original_status = 'disposed'
    AND v.payment > 0
    AND v.fee_paid_by = 'trashdrop'
    AND v.id::text NOT IN (SELECT i.item_id FROM in_withdrawals i WHERE i.item_type = 'dumping_cleanup')

  UNION ALL
  -- D: TrashDrop's top-up on promotional bins paid in cash (the collector
  --    already has the client's cash; TrashDrop owes the rest of the payout)
  SELECT 'promo_subsidy'::text, db.id::text, max(bp.platform_subsidy), max(coalesce(db.updated_at, bp.created_at))
  FROM public.bin_payments bp
  JOIN public.digital_bins db ON db.id = bp.digital_bin_id
  WHERE db.collector_id = p_collector_id
    AND db.status = 'disposed'
    AND db.is_promotional
    AND bp.type = 'collection'
    AND bp.status = 'success'
    AND bp.payment_mode = 'cash'
    AND bp.platform_subsidy > 0
    AND db.id::text NOT IN (SELECT i.item_id FROM in_withdrawals i WHERE i.item_type = 'promo_subsidy')
  GROUP BY db.id
$function$;
