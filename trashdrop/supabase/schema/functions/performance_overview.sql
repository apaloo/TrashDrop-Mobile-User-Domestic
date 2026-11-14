-- Function public.performance_overview
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- performance_overview(p_role text, p_region text, p_days integer): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.performance_overview(p_role text, p_region text DEFAULT NULL::text, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  days integer := greatest(1, least(coalesce(p_days, 30), 365));
  today date := (now() AT TIME ZONE 'Africa/Accra')::date;
  ids uuid[];
  metrics jsonb;
  acc_rows jsonb;
BEGIN
  IF NOT public.td_is_staff() THEN
    RAISE EXCEPTION 'Only TrashDrop admins can compare accounts' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(account_id) INTO ids FROM public.td_performance_accounts()
  WHERE role = p_role AND (p_region IS NULL OR public.td_norm_region(region) = public.td_norm_region(p_region));

  SELECT coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'unit', unit,
           'higher_is_better', higher_is_better, 'target', target) ORDER BY sort_order, key), '[]'::jsonb)
  INTO metrics FROM public.performance_metrics WHERE enabled AND p_role = ANY (roles);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'account_id', acc.account_id, 'name', ar.org_name, 'region', acc.region, 'district', acc.district,
           'values', (SELECT coalesce(jsonb_object_agg(m.key, (SELECT v.value FROM public.td_metric_values(m.key, ARRAY[acc.account_id], today - (days - 1), today) v)), '{}'::jsonb)
                      FROM public.performance_metrics m WHERE m.enabled AND p_role = ANY (m.roles)))
         ORDER BY ar.org_name NULLS LAST), '[]'::jsonb)
  INTO acc_rows
  FROM public.td_performance_accounts() acc
  JOIN public.account_roles ar ON ar.user_id = acc.account_id
  WHERE acc.account_id = ANY (coalesce(ids, '{}'));

  RETURN jsonb_build_object('role', p_role, 'region', p_region, 'days', days,
    'refreshed_at', (SELECT refreshed_at FROM public.performance_refresh),
    'metrics', metrics, 'accounts', acc_rows);
END $function$;
