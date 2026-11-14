-- Function public.get_collector_total_disbursed
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_collector_total_disbursed(p_collector_id uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.get_collector_total_disbursed(p_collector_id uuid)
 RETURNS numeric
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT
    -- New system: withdrawals table
    COALESCE((
      SELECT SUM(w.amount)
      FROM withdrawals w
      WHERE w.collector_id = p_collector_id
        AND w.status = 'completed'
    ), 0)
    +
    -- Legacy: bin_payments disbursement records
    COALESCE((
      SELECT SUM(bp.collector_share)
      FROM bin_payments bp
      WHERE bp.collector_id IN (
        SELECT id FROM collector_profiles WHERE user_id = p_collector_id
      )
        AND bp.type = 'disbursement'
        AND bp.status = 'success'
    ), 0);
$function$;
