-- Function public.admin_stale_requests
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- admin_stale_requests(p_days integer): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.admin_stale_requests(p_days integer DEFAULT 30)
 RETURNS TABLE(source text, id text, status text, created_at timestamp with time zone, days_waiting integer, customer_name text, address text, open_alerts integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_do('dashboard.liveQueue') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = 'insufficient_privilege'; END IF;
  RETURN QUERY
  SELECT r.source, r.id, r.status, r.created_at, (extract(epoch FROM now() - r.created_at) / 86400)::int,
         r.customer_name, r.address,
         (SELECT count(*)::int FROM public.alerts a WHERE a.entity_ref = r.id AND a.status IN ('open', 'acknowledged', 'in_progress'))
  FROM public.admin_pickup_requests r
  WHERE public.td_request_group(r.status, r.collector_ref) = 'pending'
    AND r.created_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
  ORDER BY r.created_at;
END $function$;
