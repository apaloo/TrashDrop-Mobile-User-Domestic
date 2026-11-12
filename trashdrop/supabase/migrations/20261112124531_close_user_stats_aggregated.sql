-- Personal data (TD19, TD51; owner's approval 2026-11-12). The materialized
-- view user_stats_aggregated (names, emails and points; an old copy no app
-- reads and nothing refreshes) was readable by anyone. Materialized views
-- can't have row-level security, so it is closed to app users, with its
-- refresh function. To be dropped with the other unused objects (TD51).
REVOKE SELECT ON public.user_stats_aggregated FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_user_stats_aggregated() FROM PUBLIC, anon, authenticated;
