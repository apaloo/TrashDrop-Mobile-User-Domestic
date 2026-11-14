-- Function public.my_performance
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- my_performance(p_days integer, p_account uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.my_performance(p_days integer DEFAULT 30, p_account uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  who uuid := coalesce(p_account, public.td_effective_account(auth.uid()));
  days integer := greatest(1, least(coalesce(p_days, 30), 365));
  today date := (now() AT TIME ZONE 'Africa/Accra')::date;
  p_from date;
  prev_from date;
  me record;
  peers uuid[];
  m public.performance_metrics;
  mine numeric;
  prev numeric;
  rnk integer;
  ranked integer;
  trend jsonb;
  result jsonb := '[]'::jsonb;
  refreshed timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to see performance' USING ERRCODE = '42501';
  END IF;
  IF who IS DISTINCT FROM public.td_effective_account(auth.uid()) AND NOT public.td_is_staff() THEN
    RAISE EXCEPTION 'You can only see your own performance' USING ERRCODE = '42501';
  END IF;

  -- Totals older than 5 minutes (no pg_cron, or it lags): refresh now
  SELECT refreshed_at INTO refreshed FROM public.performance_refresh;
  IF refreshed IS NULL OR refreshed < now() - interval '5 minutes' THEN
    PERFORM public.td_refresh_performance();
    SELECT refreshed_at INTO refreshed FROM public.performance_refresh;
  END IF;

  SELECT ar.user_id, ar.role, ar.org_name, ar.region, ar.district INTO me
  FROM public.account_roles ar WHERE ar.user_id = who;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('account_id', who, 'role', 'user', 'metrics', '[]'::jsonb, 'refreshed_at', refreshed);
  END IF;

  p_from := today - (days - 1);
  prev_from := p_from - days;

  -- Peers: approved accounts of the same type in the same region (or all of
  -- Ghana when the account has no region)
  SELECT array_agg(acc.account_id) INTO peers
  FROM public.td_performance_accounts() acc
  WHERE acc.role = me.role
    AND (me.region IS NULL OR public.td_norm_region(acc.region) = public.td_norm_region(me.region));

  FOR m IN
    SELECT * FROM public.performance_metrics
    WHERE enabled AND me.role = ANY (roles)
    ORDER BY sort_order, key
  LOOP
    SELECT v.value INTO mine FROM public.td_metric_values(m.key, ARRAY[who], p_from, today) v;
    prev := NULL;
    trend := NULL;
    IF m.calc <> 'area_open_backlog' THEN
      SELECT v.value INTO prev FROM public.td_metric_values(m.key, ARRAY[who], prev_from, p_from - 1) v;
      SELECT coalesce(jsonb_agg(jsonb_build_object('day', d.day,
               'value', CASE
                 WHEN m.calc IN ('activity_count', 'area_reports') THEN d.num
                 WHEN m.calc IN ('activity_ratio', 'area_cleaned_within') THEN round(100 * d.num / nullif(d.den, 0), 1)
                 ELSE round(d.num / nullif(d.den, 0), 1) END) ORDER BY d.day), '[]'::jsonb)
      INTO trend
      FROM public.performance_daily d
      WHERE d.account_id = who AND d.metric_key = m.key AND d.day BETWEEN p_from AND today;
    END IF;

    rnk := NULL;
    ranked := NULL;
    IF m.higher_is_better IS NOT NULL AND mine IS NOT NULL THEN
      SELECT count(*) FILTER (WHERE v.value IS NOT NULL),
             1 + count(*) FILTER (WHERE v.value IS NOT NULL AND
                   CASE WHEN m.higher_is_better THEN v.value > mine ELSE v.value < mine END)
      INTO ranked, rnk
      FROM public.td_metric_values(m.key, peers, p_from, today) v;
    END IF;

    result := result || jsonb_build_object(
      'key', m.key, 'label', m.label, 'description', m.description, 'unit', m.unit,
      'higher_is_better', m.higher_is_better, 'target', m.target,
      'value', mine, 'previous', prev, 'trend', trend,
      'rank', rnk, 'of', ranked, 'live', m.calc = 'area_open_backlog');
  END LOOP;

  RETURN jsonb_build_object(
    'account_id', who, 'role', me.role, 'name', me.org_name,
    'region', me.region, 'district', me.district,
    'rank_area', coalesce(me.region, 'Ghana'),
    'period', jsonb_build_object('from', p_from, 'to', today, 'days', days),
    'refreshed_at', refreshed,
    'metrics', result);
END $function$;
