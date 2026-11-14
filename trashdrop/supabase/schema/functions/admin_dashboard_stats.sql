-- Function public.admin_dashboard_stats
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- admin_dashboard_stats(p_from timestamp with time zone, p_to timestamp with time zone, p_assign_min integer, p_complete_hours integer): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats(p_from timestamp with time zone, p_to timestamp with time zone, p_assign_min integer DEFAULT 30, p_complete_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  len interval;
  prev_from timestamptz;
  by_day boolean;
  res jsonb;
BEGIN
  IF NOT public.can_do('dashboard.stats') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to - p_from > interval '400 days' THEN
    RAISE EXCEPTION 'Choose a period of up to 400 days' USING ERRCODE = 'check_violation';
  END IF;
  len := p_to - p_from;
  prev_from := p_from - len;
  by_day := len <= interval '31 days';

  WITH req AS (
    SELECT r.source, r.id, r.status, r.created_at, r.collector_ref, r.accepted_at, r.completed_at,
           public.td_request_group(r.status, r.collector_ref) AS grp
    FROM public.admin_pickup_requests r
    WHERE r.created_at >= prev_from AND r.created_at < p_to
  ),
  cur AS (SELECT * FROM req WHERE created_at >= p_from),
  prev AS (SELECT * FROM req WHERE created_at < p_from),
  sla AS (
    -- completed requests that have both timestamps; met = within both limits
    SELECT CASE WHEN created_at >= p_from THEN 'cur' ELSE 'prev' END AS p,
           count(*) FILTER (WHERE accepted_at - created_at <= make_interval(mins => p_assign_min)
                              AND completed_at - created_at <= make_interval(hours => p_complete_hours)) AS met,
           count(*) AS measured
    FROM req
    WHERE grp = 'completed' AND accepted_at IS NOT NULL AND completed_at IS NOT NULL
    GROUP BY 1
  ),
  buckets AS (
    SELECT b AS start, b + CASE WHEN by_day THEN interval '1 day' ELSE interval '7 days' END AS stop
    FROM generate_series(
      CASE WHEN by_day THEN date_trunc('day', p_from) ELSE date_trunc('week', p_from) END,
      p_to - interval '1 second',
      CASE WHEN by_day THEN interval '1 day' ELSE interval '7 days' END) b
  ),
  col AS (
    SELECT c.id::text AS id, c.user_id::text AS user_id,
           nullif(btrim(concat_ws(' ', j ->> 'first_name', j ->> 'last_name')), '') AS name,
           lower(coalesce(j ->> 'status', '')) AS status,
           coalesce(public.td_try_ts(j ->> 'location_updated_at'), public.td_try_ts(j ->> 'last_active'),
                    public.td_try_ts(j ->> 'last_active_at')) AS last_seen
    FROM public.collector_profiles c, LATERAL (SELECT to_jsonb(c) AS j) x
  ),
  live AS (
    SELECT r.collector_ref, public.td_request_group(r.status, r.collector_ref) AS grp, r.completed_at, r.created_at
    FROM public.admin_pickup_requests r
  ),
  colstate AS (
    SELECT col.*,
           EXISTS (SELECT 1 FROM live WHERE live.collector_ref IN (col.id, col.user_id) AND live.grp IN ('assigned', 'in_progress')) AS on_job,
           (SELECT count(*) FROM live WHERE live.collector_ref IN (col.id, col.user_id) AND live.grp = 'completed'
              AND live.completed_at >= date_trunc('day', now())) AS done_today,
           CASE
             WHEN col.status IN ('on_break', 'break', 'on break') THEN 'on_break'
             WHEN col.last_seen >= now() - interval '10 minutes'
               THEN CASE WHEN EXISTS (SELECT 1 FROM live WHERE live.collector_ref IN (col.id, col.user_id)
                                      AND live.grp IN ('assigned', 'in_progress')) THEN 'active' ELSE 'idle' END
             ELSE 'off_duty' END AS state
    FROM col
  ),
  live_batches AS (SELECT * FROM public.admin_bag_batches WHERE stage <> 'archived'),
  bag_items AS (SELECT i.* FROM public.admin_bag_items i JOIN live_batches b ON b.id = i.batch_id)
  SELECT jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'prev_from', prev_from, 'bucket', CASE WHEN by_day THEN 'day' ELSE 'week' END),
    'definitions', jsonb_build_object('sla_assign_min', p_assign_min, 'sla_complete_hours', p_complete_hours, 'online_minutes', 10),
    'requests', jsonb_build_object(
      'total', (SELECT count(*) FROM cur),
      'prev_total', (SELECT count(*) FROM prev),
      'pending', (SELECT count(*) FROM cur WHERE grp = 'pending'),
      'prev_pending', (SELECT count(*) FROM prev WHERE grp = 'pending'),
      'by_status', (SELECT jsonb_object_agg(g, coalesce(n, 0)) FROM
                      (SELECT g, (SELECT count(*) FROM cur WHERE grp = g) AS n
                       FROM unnest(ARRAY['pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'other']) g) s),
      'by_source', (SELECT coalesce(jsonb_object_agg(source, n), '{}'::jsonb) FROM (SELECT source, count(*) AS n FROM cur GROUP BY source) s),
      -- open now, any date (matches the Alerts rule)
      'pending_all_dates', (SELECT count(*) FROM live WHERE grp = 'pending'),
      'oldest_pending_at', (SELECT min(created_at) FROM live WHERE grp = 'pending')),
    'sla', jsonb_build_object(
      'met', (SELECT met FROM sla WHERE p = 'cur'), 'measured', (SELECT measured FROM sla WHERE p = 'cur'),
      'completed', (SELECT count(*) FROM cur WHERE grp = 'completed'),
      'prev_met', (SELECT met FROM sla WHERE p = 'prev'), 'prev_measured', (SELECT measured FROM sla WHERE p = 'prev')),
    'collectors', jsonb_build_object(
      'total', (SELECT count(*) FROM colstate),
      'active', (SELECT count(*) FROM colstate WHERE state = 'active'),
      'idle', (SELECT count(*) FROM colstate WHERE state = 'idle'),
      'on_break', (SELECT count(*) FROM colstate WHERE state = 'on_break'),
      'off_duty', (SELECT count(*) FROM colstate WHERE state = 'off_duty'),
      'unassigned_waiting', (SELECT count(*) FROM live WHERE grp = 'pending'),
      'completed_today', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', coalesce(name, left(id, 8)), 'done', done_today, 'state', state)
                                                    ORDER BY done_today DESC, name), '[]'::jsonb)
                          FROM colstate WHERE done_today > 0 OR state IN ('active', 'idle'))),
    'waste', (SELECT coalesce(jsonb_object_agg(t, n), '{}'::jsonb) FROM (
                SELECT coalesce(nullif(btrim(type), ''), 'Unclassified') AS t, sum(bag_count) AS n
                FROM live_batches WHERE created_at >= p_from AND created_at < p_to GROUP BY 1) w),
    'bags', jsonb_build_object(
      'series', (SELECT jsonb_agg(jsonb_build_object(
                   'start', bk.start,
                   'generated', (SELECT coalesce(sum(bag_count), 0) FROM live_batches b WHERE b.created_at >= bk.start AND b.created_at < bk.stop),
                   'distributed', (SELECT count(*) FROM bag_items i WHERE i.household_id IS NOT NULL AND i.created_at >= bk.start AND i.created_at < bk.stop),
                   'collected', (SELECT count(*) FROM bag_items i WHERE i.collected_at >= bk.start AND i.collected_at < bk.stop)) ORDER BY bk.start)
                 FROM buckets bk),
      'all_time', jsonb_build_object(
        'batches', (SELECT count(*) FROM live_batches),
        'bags', (SELECT coalesce(sum(bag_count), 0) FROM live_batches),
        'distributed', (SELECT count(*) FROM bag_items WHERE stage_rank >= 2),
        'collected', (SELECT count(*) FROM bag_items WHERE stage_rank >= 4))),
    'dumping', (SELECT jsonb_agg(jsonb_build_object('start', bk.start,
                  'reports', (SELECT count(*) FROM public.illegal_dumping_mobile d WHERE d.created_at >= bk.start AND d.created_at < bk.stop))
                  ORDER BY bk.start) FROM buckets bk),
    'dumping_total', (SELECT count(*) FROM public.illegal_dumping_mobile d WHERE d.created_at >= p_from AND d.created_at < p_to),
    'alerts', jsonb_build_object(
      'open', (SELECT count(*) FROM public.alerts a WHERE a.status IN ('open', 'acknowledged', 'in_progress')),
      'latest', (SELECT coalesce(jsonb_agg(x ORDER BY x.sev DESC, x.raised_at DESC), '[]'::jsonb) FROM (
         SELECT a.id, a.title, a.description, a.severity, a.status, a.rule_key, a.entity_type, a.entity_source, a.entity_ref,
                a.created_at AS raised_at, a.last_seen_at,
                CASE a.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END AS sev,
                r.created_at AS request_created_at, r.status AS request_status, r.collector_ref AS request_collector
         FROM public.alerts a
         LEFT JOIN public.admin_pickup_requests r
           ON a.entity_type = 'pickup_request' AND r.id = a.entity_ref AND r.source = coalesce(a.entity_source, r.source)
         WHERE a.status IN ('open', 'acknowledged', 'in_progress')
         ORDER BY CASE a.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC, a.created_at DESC
         LIMIT 6) x)),
    'fetched_at', now()
  ) INTO res;
  -- Parts of the page this role may not see are left out (null), not sent as zeros
  IF NOT public.can_do('bags.view') THEN res := res - 'waste' - 'bags'; END IF;
  IF NOT public.can_do('alerts.view') THEN res := res - 'alerts'; END IF;
  RETURN res;
END $function$;
