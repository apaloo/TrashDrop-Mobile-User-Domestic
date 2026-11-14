-- Function public.get_collector_earnings_summary
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_collector_earnings_summary(p_collector_id uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.get_collector_earnings_summary(p_collector_id uuid)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  -- CRITICAL: All calculations exclude platform fee (GHC 1.00) before applying share
  SELECT json_build_object(
    'total_earnings', (
      SELECT COALESCE(SUM(payout), 0)
      FROM (
        SELECT GREATEST(fee - 1.00, 0) * 0.87 as payout FROM pickup_requests 
        WHERE collector_id = p_collector_id AND status = 'disposed'
        UNION ALL
        SELECT collector_total_payout as payout FROM digital_bins 
        WHERE collector_id = p_collector_id AND status = 'disposed'
      ) combined
    ),
    'pending_earnings', (
      SELECT COALESCE(SUM(GREATEST(fee - 1.00, 0) * 0.87), 0)
      FROM pickup_requests
      WHERE collector_id = p_collector_id AND status = 'picked_up'
    ),
    'weekly_earnings', (
      SELECT COALESCE(SUM(GREATEST(fee - 1.00, 0) * 0.87), 0)
      FROM pickup_requests
      WHERE collector_id = p_collector_id 
        AND status = 'disposed'
        AND created_at >= NOW() - INTERVAL '7 days'
    ),
    'monthly_earnings', (
      SELECT COALESCE(SUM(GREATEST(fee - 1.00, 0) * 0.87), 0)
      FROM pickup_requests
      WHERE collector_id = p_collector_id 
        AND status = 'disposed'
        AND created_at >= NOW() - INTERVAL '30 days'
    ),
    'total_jobs', (
      SELECT COUNT(*) FROM pickup_requests 
      WHERE collector_id = p_collector_id AND status = 'disposed'
    ),
    'completion_rate', (
      SELECT CASE 
        WHEN COUNT(*) = 0 THEN 100.0
        ELSE ROUND((COUNT(*) FILTER (WHERE status = 'disposed')::DECIMAL / COUNT(*)) * 100, 1)
      END
      FROM pickup_requests
      WHERE collector_id = p_collector_id AND status IN ('accepted', 'picked_up', 'disposed')
    )
  );
$function$;
