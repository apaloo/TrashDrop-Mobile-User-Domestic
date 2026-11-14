-- Function public.get_collector_withdrawal_summary
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_collector_withdrawal_summary(p_collector_id uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.get_collector_withdrawal_summary(p_collector_id uuid)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT json_build_object(
    'total_withdrawn', COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0),
    'pending_withdrawals', COALESCE(SUM(CASE WHEN status IN ('pending', 'processing') THEN amount ELSE 0 END), 0),
    'total_requests', COUNT(*),
    'completed_count', COUNT(*) FILTER (WHERE status = 'completed'),
    'pending_count', COUNT(*) FILTER (WHERE status IN ('pending', 'processing')),
    'failed_count', COUNT(*) FILTER (WHERE status = 'failed')
  )
  FROM public.withdrawals
  WHERE collector_id = p_collector_id;
$function$;
