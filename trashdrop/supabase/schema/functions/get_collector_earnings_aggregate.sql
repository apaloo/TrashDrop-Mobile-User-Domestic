-- Function public.get_collector_earnings_aggregate
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_collector_earnings_aggregate(p_collector_id uuid, p_start_date timestamp without time zone, p_end_date timestamp without time zone): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_collector_earnings_aggregate(p_collector_id uuid, p_start_date timestamp without time zone DEFAULT NULL::timestamp without time zone, p_end_date timestamp without time zone DEFAULT NULL::timestamp without time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_result JSON;
  v_start_date TIMESTAMP := COALESCE(p_start_date, NOW() - INTERVAL '30 days');
  v_end_date TIMESTAMP := COALESCE(p_end_date, NOW());
BEGIN
  PERFORM public.td_assert_self_or_staff(p_collector_id);
  SELECT json_build_object(
    -- Pickup request earnings (disposed)
    'pickup_earnings', (
      SELECT json_build_object(
        'total', COALESCE(SUM(GREATEST(fee - 1.00, 0) * 0.87), 0),
        'core', COALESCE(SUM(GREATEST(fee - 1.00, 0) * 0.70), 0),
        'urgent', 0,
        'distance', 0,
        'surge', 0,
        'tips', 0,
        'recyclables', 0,
        'loyalty', 0,
        'items', COALESCE(json_agg(
          json_build_object(
            'id', id,
            'waste_type', waste_type,
            'fee', fee,
            'collector_total_payout', collector_total_payout,
            'total_bill', fee,
            'status', status,
            'created_at', created_at,
            'disposed_at', updated_at,
            'payment_type', COALESCE(payment_type, 'digital')
          ) ORDER BY created_at DESC
        ) FILTER (WHERE id IS NOT NULL), '[]'::json)
      )
      FROM pickup_requests
      WHERE collector_id = p_collector_id
        AND status IN ('collecting', 'disposed')
        AND created_at BETWEEN v_start_date AND v_end_date
    ),
    
    -- Digital bin earnings (from actual bin_payments - TrendiPay processed)
    'digital_bin_earnings', (
      SELECT json_build_object(
        'total', COALESCE(SUM(bp.collector_share), 0),
        'core', COALESCE(SUM(CASE WHEN bp.payment_mode = 'cash' THEN bp.collector_share ELSE 0 END), 0),
        'urgent', COALESCE(SUM(CASE WHEN bp.payment_mode != 'cash' THEN bp.collector_share ELSE 0 END), 0),
        'distance', 0,
        'surge', 0,
        'tips', 0,
        'recyclables', 0,
        'loyalty', 0,
        'items', COALESCE(json_agg(
          json_build_object(
            'id', db.id,
            'waste_type', db.waste_type,
            'fee', db.fee,
            'collector_total_payout', bp.collector_share,
            'total_bill', bp.total_bill,
            'payment_mode', bp.payment_mode,
            'status', db.status,
            'created_at', bp.created_at,
            'disposed_at', bp.updated_at
          ) ORDER BY bp.created_at DESC
        ) FILTER (WHERE db.id IS NOT NULL), '[]'::json)
      )
      FROM bin_payments bp
      JOIN digital_bins db ON bp.digital_bin_id = db.id
      WHERE bp.collector_id = (SELECT id FROM collector_profiles WHERE user_id = p_collector_id LIMIT 1)
        AND bp.type = 'collection'
        AND bp.status = 'success'
        AND db.status = 'disposed'
        AND bp.created_at BETWEEN v_start_date AND v_end_date
    ),
    
    -- Pending earnings (picked_up but not yet paid)
    'pending_earnings', (
      SELECT json_build_object(
        'total', COALESCE(
          (SELECT SUM(GREATEST(fee - 1.00, 0) * 0.87) FROM pickup_requests 
           WHERE collector_id = p_collector_id AND status = 'picked_up'), 0
        ),
        'pickups', (SELECT COUNT(*) FROM pickup_requests 
                    WHERE collector_id = p_collector_id AND status = 'picked_up'),
        'bins', (SELECT COUNT(*) FROM digital_bins 
                 WHERE collector_id = p_collector_id AND status = 'picked_up')
      )
    ),
    
    -- Platform share calculation
    'platform_share', (
      SELECT COALESCE(SUM(1.00 + GREATEST(fee - 1.00, 0) * 0.13), 0)
      FROM pickup_requests
      WHERE collector_id = p_collector_id
        AND status IN ('collecting', 'disposed')
        AND created_at BETWEEN v_start_date AND v_end_date
    ),
    
    -- Payment settlements (cash vs digital) - UPDATED to include pickup_requests
    'settlements', (
      SELECT json_build_object(
        'cash_collected', COALESCE(
          -- From bin_payments (only disposed bins)
          (SELECT SUM(CASE WHEN bp.payment_mode = 'cash' THEN bp.total_bill ELSE 0 END)
           FROM bin_payments bp
           JOIN digital_bins db ON bp.digital_bin_id = db.id
           WHERE bp.collector_id = (SELECT id FROM collector_profiles WHERE user_id = p_collector_id LIMIT 1)
             AND bp.type = 'collection'
             AND bp.status = 'success'
             AND db.status = 'disposed'
             AND bp.created_at BETWEEN v_start_date AND v_end_date), 0
        ) + COALESCE(
          -- From pickup_requests (legacy data, using payment_type)
          (SELECT SUM(CASE WHEN payment_type = 'cash' THEN fee ELSE 0 END)
           FROM pickup_requests
           WHERE collector_id = p_collector_id
             AND status IN ('collecting', 'disposed')
             AND created_at BETWEEN v_start_date AND v_end_date), 0
        ),
        'digital_collected', COALESCE(
          -- From bin_payments (only disposed bins)
          (SELECT SUM(CASE WHEN bp.payment_mode != 'cash' THEN bp.total_bill ELSE 0 END)
           FROM bin_payments bp
           JOIN digital_bins db ON bp.digital_bin_id = db.id
           WHERE bp.collector_id = (SELECT id FROM collector_profiles WHERE user_id = p_collector_id LIMIT 1)
             AND bp.type = 'collection'
             AND bp.status = 'success'
             AND db.status = 'disposed'
             AND bp.created_at BETWEEN v_start_date AND v_end_date), 0
        ) + COALESCE(
          -- From pickup_requests (legacy data - all non-cash treated as digital)
          (SELECT SUM(CASE WHEN COALESCE(payment_type, 'digital') != 'cash' THEN fee ELSE 0 END)
           FROM pickup_requests
           WHERE collector_id = p_collector_id
             AND status IN ('collecting', 'disposed')
             AND created_at BETWEEN v_start_date AND v_end_date), 0
        ),
        'total_collected', COALESCE(
          (SELECT SUM(bp.total_bill) FROM bin_payments bp
           JOIN digital_bins db ON bp.digital_bin_id = db.id
           WHERE bp.collector_id = (SELECT id FROM collector_profiles WHERE user_id = p_collector_id LIMIT 1)
             AND bp.type = 'collection'
             AND bp.status = 'success'
             AND db.status = 'disposed'
             AND bp.created_at BETWEEN v_start_date AND v_end_date), 0
        ) + COALESCE(
          (SELECT SUM(fee) FROM pickup_requests
           WHERE collector_id = p_collector_id
             AND status IN ('collecting', 'disposed')
             AND created_at BETWEEN v_start_date AND v_end_date), 0
        )
      )
    ),
    
    -- Job counts
    'job_counts', (
      SELECT json_build_object(
        'total_picked_up', (
          SELECT COUNT(*) FROM pickup_requests 
          WHERE collector_id = p_collector_id AND status IN ('picked_up', 'disposed')
        ),
        'total_disposed', (
          SELECT COUNT(*) FROM pickup_requests 
          WHERE collector_id = p_collector_id AND status = 'disposed'
        ),
        'bins_picked_up', (
          SELECT COUNT(*) FROM digital_bins 
          WHERE collector_id = p_collector_id AND status IN ('picked_up', 'disposed')
        ),
        'bins_disposed', (
          SELECT COUNT(*) FROM digital_bins 
          WHERE collector_id = p_collector_id AND status = 'disposed'
        )
      )
    ),
    
    -- Completion rate
    'completion_rate', (
      SELECT CASE 
        WHEN COUNT(*) = 0 THEN 100.0
        ELSE ROUND((COUNT(*) FILTER (WHERE status = 'disposed')::DECIMAL / COUNT(*)) * 100, 1)
      END
      FROM pickup_requests
      WHERE collector_id = p_collector_id
        AND status IN ('accepted', 'picked_up', 'disposed')
    ),
    
    -- Weekly earnings (last 7 days)
    'weekly_earnings', (
      SELECT COALESCE(SUM(GREATEST(fee - 1.00, 0) * 0.87), 0)
      FROM pickup_requests
      WHERE collector_id = p_collector_id
        AND status = 'disposed'
        AND created_at >= NOW() - INTERVAL '7 days'
    ),
    
    -- Monthly earnings (last 30 days)
    'monthly_earnings', (
      SELECT COALESCE(SUM(GREATEST(fee - 1.00, 0) * 0.87), 0)
      FROM pickup_requests
      WHERE collector_id = p_collector_id
        AND status = 'disposed'
        AND created_at >= NOW() - INTERVAL '30 days'
    ),
    
    -- Loyalty tier calculation
    'loyalty_tier', (
      SELECT CASE
        WHEN total_completed >= 100 THEN json_build_object('tier', 'Platinum', 'cashback_rate', 0.03)
        WHEN total_completed >= 50 THEN json_build_object('tier', 'Gold', 'cashback_rate', 0.02)
        WHEN total_completed >= 20 THEN json_build_object('tier', 'Silver', 'cashback_rate', 0.01)
        ELSE json_build_object('tier', 'Bronze', 'cashback_rate', 0.005)
      END
      FROM (SELECT COUNT(*) as total_completed FROM pickup_requests 
            WHERE collector_id = p_collector_id AND status = 'disposed') t
    ),
    
    -- Tips received
    'tips_received', (
      SELECT json_build_object(
        'total', COALESCE(SUM(amount), 0),
        'count', COUNT(*)
      )
      FROM collector_tips
      WHERE collector_id = p_collector_id
    ),
    
    -- Chart data (daily earnings for last 30 days)
    'chart_data', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'date', date_trunc('day', created_at)::date,
          'amount', GREATEST(fee - 1.00, 0) * 0.87
        ) ORDER BY date_trunc('day', created_at)
      ), '[]'::json)
      FROM pickup_requests
      WHERE collector_id = p_collector_id
        AND status = 'disposed'
        AND created_at >= NOW() - INTERVAL '30 days'
    ),
    
    'generated_at', NOW()
  ) INTO v_result;
  
  RETURN v_result;
END;
$function$;
