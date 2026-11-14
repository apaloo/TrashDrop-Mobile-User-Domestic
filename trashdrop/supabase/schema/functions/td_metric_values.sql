-- Function public.td_metric_values
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_metric_values(p_key text, p_accounts uuid[], p_from date, p_to date): execute: service_role
CREATE OR REPLACE FUNCTION public.td_metric_values(p_key text, p_accounts uuid[], p_from date, p_to date)
 RETURNS TABLE(account_id uuid, value numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m public.performance_metrics;
BEGIN
  SELECT * INTO m FROM public.performance_metrics WHERE key = p_key;
  IF NOT FOUND THEN RETURN; END IF;

  IF m.calc = 'area_open_backlog' THEN
    -- Right now, not per period
    RETURN QUERY
    SELECT acc.account_id, count(r.id)::numeric
    FROM public.td_performance_accounts() acc
    LEFT JOIN public.illegal_dumping_mobile r
      ON lower(coalesce(r.status, 'pending')) IN ('pending', 'verified', 'in_progress')
     AND public.td_in_account_area(acc.role, acc.region, acc.district, r.region, r.district)
    WHERE acc.account_id = ANY (p_accounts)
    GROUP BY acc.account_id;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ids.id,
         CASE
           WHEN m.calc IN ('activity_count', 'area_reports') THEN coalesce(sum(d.num), 0)
           WHEN m.calc IN ('activity_ratio', 'area_cleaned_within') THEN round(100 * sum(d.num) / nullif(sum(d.den), 0), 1)
           ELSE round(sum(d.num) / nullif(sum(d.den), 0), 1)
         END
  FROM unnest(p_accounts) AS ids(id)
  LEFT JOIN public.performance_daily d
    ON d.account_id = ids.id AND d.metric_key = m.key AND d.day BETWEEN p_from AND p_to
  GROUP BY ids.id;
END $function$;
