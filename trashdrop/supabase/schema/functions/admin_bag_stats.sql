-- Function public.admin_bag_stats
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- admin_bag_stats(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.admin_bag_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Africa/Accra') AT TIME ZONE 'Africa/Accra';
  week_start timestamptz := date_trunc('week', now() AT TIME ZONE 'Africa/Accra') AT TIME ZONE 'Africa/Accra';
  res jsonb;
BEGIN
  IF NOT public.can_do('bags.view') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = 'insufficient_privilege'; END IF;
  WITH p AS (
    SELECT pr.created_at,
           greatest(1, least(500, coalesce(
             CASE WHEN to_jsonb(pr) ->> 'estimated_volume' ~ '^\d+(\.\d+)?$' THEN round((to_jsonb(pr) ->> 'estimated_volume')::numeric)::int END,
             CASE WHEN to_jsonb(pr) ->> 'bag_count' ~ '^\d+$' THEN (to_jsonb(pr) ->> 'bag_count')::int END, 1))) AS n,
           public.td_canon_status(to_jsonb(pr) ->> 'status') AS st,
           coalesce((to_jsonb(pr) ->> 'completed_at')::timestamptz, (to_jsonb(pr) ->> 'disposed_at')::timestamptz,
                    (to_jsonb(pr) ->> 'picked_up_at')::timestamptz, (to_jsonb(pr) ->> 'updated_at')::timestamptz) AS done_at
    FROM public.pickup_requests pr
    WHERE to_jsonb(pr) ->> 'batch_id' IS NOT NULL
  ), w AS (
    SELECT p.*, p.st IN ('collecting', 'disposed') AS collected,
           p.st NOT IN ('collecting', 'disposed', 'cancelled', 'expired') AS open
    FROM p WHERE p.st NOT IN ('cancelled', 'expired')
  )
  SELECT jsonb_build_object(
    'requests_today',     (SELECT count(*) FROM p WHERE p.created_at >= day_start),
    'pending_collection', (SELECT count(*) FROM w WHERE w.open),
    'collected_today',    (SELECT count(*) FROM w WHERE w.collected AND w.done_at >= day_start),
    'bags_awaiting',      (SELECT count(*) FROM public.admin_bag_items i WHERE i.stage = 'distributed'),
    'this_week', jsonb_build_object(
      'bags_requested', (SELECT coalesce(sum(n), 0) FROM w WHERE w.created_at >= week_start),
      'bags_collected', (SELECT coalesce(sum(n), 0) FROM w WHERE w.created_at >= week_start AND w.collected)),
    'last_week', jsonb_build_object(
      'bags_requested', (SELECT coalesce(sum(n), 0) FROM w WHERE w.created_at >= week_start - interval '7 days' AND w.created_at < week_start),
      'bags_collected', (SELECT coalesce(sum(n), 0) FROM w WHERE w.created_at >= week_start - interval '7 days' AND w.created_at < week_start AND w.collected)),
    -- request → collected, last 30 days, in minutes
    'avg_fill_to_collect_minutes', (SELECT round(avg(extract(epoch FROM (w.done_at - w.created_at)) / 60))
                                     FROM w WHERE w.collected AND w.done_at > w.created_at AND w.done_at >= now() - interval '30 days'),
    'collected_last_30_days', (SELECT count(*) FROM w WHERE w.collected AND w.done_at >= now() - interval '30 days')
  ) INTO res;
  RETURN res;
END $function$;
