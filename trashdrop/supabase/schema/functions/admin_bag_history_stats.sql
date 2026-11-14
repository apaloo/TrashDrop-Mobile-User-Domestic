-- Function public.admin_bag_history_stats
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- admin_bag_history_stats(p_days integer): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.admin_bag_history_stats(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  days integer := greatest(1, least(coalesce(p_days, 30), 366));
  first_day date := (now() AT TIME ZONE 'Africa/Accra')::date - (days - 1);
  res jsonb;
BEGIN
  IF NOT public.can_do('bags.view') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = 'insufficient_privilege'; END IF;
  WITH live AS (SELECT * FROM public.admin_bag_batches WHERE stage <> 'archived'),
  bags AS (SELECT i.* FROM public.admin_bag_items i JOIN live ON live.id = i.batch_id),
  ev AS (
    SELECT (e.at AT TIME ZONE 'Africa/Accra')::date AS day
    FROM public.admin_bag_events e JOIN live ON live.id = e.batch_id
    WHERE e.kind IN ('household_scan', 'scan') AND e.at >= (first_day::timestamp AT TIME ZONE 'Africa/Accra')
  )
  SELECT jsonb_build_object(
    'total_batches', (SELECT count(*) FROM live),
    'total_bags', (SELECT coalesce(sum(bag_count), 0) FROM live),
    'bag_rows', (SELECT count(*) FROM bags),
    'bags_scanned', (SELECT count(*) FROM bags WHERE scan_count > 0),
    'bags_collected', (SELECT count(*) FROM bags WHERE stage_rank >= 4),
    -- household scan (bag handed over) → collected, minutes
    'avg_distributed_to_collected_minutes', (
      SELECT round(avg(extract(epoch FROM (collected_at - created_at)) / 60))
      FROM bags WHERE collected_at IS NOT NULL AND household_id IS NOT NULL AND collected_at > created_at),
    'days', days,
    'scans_per_day', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'scans', coalesce(c.n, 0)) ORDER BY d), '[]'::jsonb)
      FROM generate_series(first_day, (now() AT TIME ZONE 'Africa/Accra')::date, interval '1 day') d
      LEFT JOIN (SELECT day, count(*) AS n FROM ev GROUP BY day) c ON c.day = d::date),
    'fetched_at', now()
  ) INTO res;
  RETURN res;
END $function$;
