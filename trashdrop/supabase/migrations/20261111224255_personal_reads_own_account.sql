-- Reads of one person's data: signed-in, own account (or staff) only.
--
-- These SECURITY DEFINER functions return a household's dashboard, stats or
-- onboarding state, or a collector's earnings, for the id passed in, and
-- signed-out visitors could run them. Callers checked 2026-11-11:
--
-- Server and database only (no caller in any app; validate_cashout, which
-- uses get_collector_available_earnings, runs as its owner):
--   get_collector_available_earnings, get_collector_earnings_breakdown,
--   get_collector_earnings_summary, get_collector_total_disbursed,
--   get_collector_withdrawal_summary
--
-- Signed-in, own account or staff (td_assert_self_or_staff, from
-- 20261111223556), added at the top of the live definitions:
--   get_dashboard_data_optimized, get_critical_stats,
--   get_user_has_bags_selection, get_user_onboarding_state (household app,
--   called with the signed-in user's id)
--   get_collector_earnings_aggregate (the collector app's call to it is
--   currently bypassed)
--
-- get_welcome_discount_multiplier is part of the protected TrashDrop
-- Digital Bin Pricing (CLAUDE.md) and is left as it is.

DO $$
DECLARE
  f text;
  t record;
  def text;
  n int;
  server_only text[] := ARRAY[
    'public.get_collector_available_earnings(uuid)',
    'public.get_collector_earnings_breakdown(uuid)',
    'public.get_collector_earnings_summary(uuid)',
    'public.get_collector_total_disbursed(uuid)',
    'public.get_collector_withdrawal_summary(uuid)'
  ];
BEGIN
  FOREACH f IN ARRAY server_only LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;

  FOR t IN
    SELECT * FROM (VALUES
      ('public.get_dashboard_data_optimized(uuid, integer)', 'user_id_param'),
      ('public.get_critical_stats(uuid)', 'user_id_param'),
      ('public.get_user_has_bags_selection(uuid)', 'user_uuid'),
      ('public.get_user_onboarding_state(uuid)', 'user_uuid'),
      ('public.get_collector_earnings_aggregate(uuid, timestamp without time zone, timestamp without time zone)', 'p_collector_id')
    ) AS v(fn, param)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', t.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', t.fn);

    def := pg_get_functiondef(t.fn::regprocedure);
    IF position('td_assert_self_or_staff' IN def) > 0 THEN
      CONTINUE;
    END IF;
    n := (length(def) - length(replace(def, E'\nBEGIN\n', ''))) / length(E'\nBEGIN\n');
    IF n <> 1 THEN
      RAISE EXCEPTION '%: expected one top-level BEGIN line, found %', t.fn, n;
    END IF;
    EXECUTE replace(def, E'\nBEGIN\n', E'\nBEGIN\n  PERFORM public.td_assert_self_or_staff(' || t.param || E');\n');
  END LOOP;
END $$;
