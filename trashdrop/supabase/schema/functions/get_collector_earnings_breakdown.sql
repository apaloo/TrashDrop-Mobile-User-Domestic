-- Function public.get_collector_earnings_breakdown
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_collector_earnings_breakdown(p_collector_id uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.get_collector_earnings_breakdown(p_collector_id uuid)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT json_build_object(
    'digital_bins', (
      SELECT json_build_object(
        'total_earnings', COALESCE(SUM(collector_total_payout), 0),
        'core_payout',    COALESCE(SUM(collector_core_payout), 0),
        'urgent_payout',  COALESCE(SUM(collector_urgent_payout), 0),
        'distance_payout',COALESCE(SUM(collector_distance_payout), 0),
        'surge_payout',   COALESCE(SUM(collector_surge_payout), 0),
        'tips',           COALESCE(SUM(collector_tips), 0),
        'recyclables_payout', COALESCE(SUM(collector_recyclables_payout), 0),
        'loyalty_cashback',   COALESCE(SUM(collector_loyalty_cashback), 0),
        'count',          COUNT(*)
      )
      FROM digital_bins
      WHERE collector_id = p_collector_id AND status = 'disposed'
    ),
    'pickup_requests', (
      SELECT json_build_object(
        'total_earnings', COALESCE(SUM(collector_total_payout), 0),
        'core_payout',    COALESCE(SUM(collector_core_payout), 0),
        'urgent_payout',  COALESCE(SUM(collector_urgent_payout), 0),
        'distance_payout',COALESCE(SUM(collector_distance_payout), 0),
        'surge_payout',   COALESCE(SUM(collector_surge_payout), 0),
        'tips',           COALESCE(SUM(collector_tips), 0),
        'recyclables_payout', COALESCE(SUM(collector_recyclables_payout), 0),
        'loyalty_cashback',   COALESCE(SUM(collector_loyalty_cashback), 0),
        'count',          COUNT(*)
      )
      FROM pickup_requests
      WHERE collector_id = p_collector_id AND status = 'disposed'
    )
  );
$function$;
