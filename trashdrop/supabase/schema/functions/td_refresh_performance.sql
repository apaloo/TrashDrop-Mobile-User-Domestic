-- Function public.td_refresh_performance
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_refresh_performance(p_days integer): execute: service_role
CREATE OR REPLACE FUNCTION public.td_refresh_performance(p_days integer DEFAULT 35)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  from_day date := (now() AT TIME ZONE 'Africa/Accra')::date - greatest(1, least(p_days, 3650));
  t0 timestamptz := clock_timestamp();
  n integer := 0;
  k integer;
BEGIN
  -- One refresh at a time; a second caller just skips
  IF NOT pg_try_advisory_xact_lock(hashtext('td_refresh_performance')) THEN RETURN -1; END IF;

  DELETE FROM public.performance_daily WHERE day >= from_day;

  -- Steps the account did
  INSERT INTO public.performance_daily (account_id, metric_key, day, num, den)
  SELECT coalesce(a.team_id, a.account_id), m.key, (a.occurred_at AT TIME ZONE 'Africa/Accra')::date,
         CASE m.calc WHEN 'activity_avg' THEN sum(a.value) ELSE count(*) END,
         CASE m.calc WHEN 'activity_avg' THEN count(a.value) END
  FROM public.performance_metrics m
  JOIN public.account_activity a
    ON a.activity IN (SELECT jsonb_array_elements_text(m.params -> 'activities'))
   AND a.occurred_at >= from_day
  JOIN public.td_performance_accounts() acc ON acc.account_id = coalesce(a.team_id, a.account_id) AND acc.role = ANY (m.roles)
  WHERE m.enabled AND m.calc IN ('activity_count', 'activity_avg')
  GROUP BY 1, 2, 3
  HAVING m.calc <> 'activity_avg' OR count(a.value) > 0;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  -- Ratios: numerator and denominator steps per day
  INSERT INTO public.performance_daily (account_id, metric_key, day, num, den)
  SELECT coalesce(a.team_id, a.account_id), m.key, (a.occurred_at AT TIME ZONE 'Africa/Accra')::date,
         count(*) FILTER (WHERE a.activity IN (SELECT jsonb_array_elements_text(m.params -> 'activities'))),
         count(*) FILTER (WHERE a.activity IN (SELECT jsonb_array_elements_text(m.params -> 'of')))
  FROM public.performance_metrics m
  JOIN public.account_activity a
    ON (a.activity IN (SELECT jsonb_array_elements_text(m.params -> 'activities'))
        OR a.activity IN (SELECT jsonb_array_elements_text(m.params -> 'of')))
   AND a.occurred_at >= from_day
  JOIN public.td_performance_accounts() acc ON acc.account_id = coalesce(a.team_id, a.account_id) AND acc.role = ANY (m.roles)
  WHERE m.enabled AND m.calc = 'activity_ratio'
  GROUP BY 1, 2, 3;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  -- The account's area: new and cleaned reports, cleaned within N days,
  -- hours to clean up
  WITH acc AS (
    SELECT * FROM public.td_performance_accounts() WHERE role IN ('authority', 'volunteer')
  ), rep AS (
    SELECT r.region, r.district, r.created_at, r.completed_at,
           lower(coalesce(r.status, '')) IN ('completed', 'disposed') AS cleaned
    FROM public.illegal_dumping_mobile r
    WHERE lower(coalesce(r.status, '')) <> 'cancelled'
      AND (r.created_at >= from_day OR r.completed_at >= from_day)
  )
  INSERT INTO public.performance_daily (account_id, metric_key, day, num, den)
  SELECT acc.account_id, m.key, x.day, sum(x.num), CASE WHEN m.calc = 'area_reports' THEN NULL ELSE sum(x.den) END
  FROM public.performance_metrics m
  JOIN acc ON acc.role = ANY (m.roles)
  JOIN rep ON public.td_in_account_area(acc.role, acc.region, acc.district, rep.region, rep.district)
  CROSS JOIN LATERAL (
    SELECT (rep.created_at AT TIME ZONE 'Africa/Accra')::date AS day, 1 AS num, NULL::numeric AS den
    WHERE m.calc = 'area_reports' AND m.params ->> 'status' = 'new' AND rep.created_at >= from_day
    UNION ALL
    SELECT (rep.completed_at AT TIME ZONE 'Africa/Accra')::date, 1, NULL
    WHERE m.calc = 'area_reports' AND m.params ->> 'status' = 'cleaned' AND rep.cleaned AND rep.completed_at >= from_day
    UNION ALL
    SELECT (rep.created_at AT TIME ZONE 'Africa/Accra')::date,
           CASE WHEN rep.cleaned AND rep.completed_at <= rep.created_at + make_interval(days => (m.params ->> 'days')::int) THEN 1 ELSE 0 END,
           1
    WHERE m.calc = 'area_cleaned_within' AND rep.created_at >= from_day
    UNION ALL
    SELECT (rep.completed_at AT TIME ZONE 'Africa/Accra')::date,
           round(extract(epoch FROM (rep.completed_at - rep.created_at)) / 3600.0, 2), 1
    WHERE m.calc = 'area_avg_clean_hours' AND rep.cleaned AND rep.completed_at >= from_day
      AND rep.completed_at >= rep.created_at
  ) x
  WHERE m.enabled AND m.calc IN ('area_reports', 'area_cleaned_within', 'area_avg_clean_hours')
  GROUP BY 1, 2, 3, m.calc;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  UPDATE public.performance_refresh
  SET refreshed_at = now(), took_ms = (extract(epoch FROM clock_timestamp() - t0) * 1000)::int, rows_written = n;
  RETURN n;
END $function$;
