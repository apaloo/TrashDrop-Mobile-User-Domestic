-- Customers can't empty the promotion allowance table.
--
-- Supabase grants TRUNCATE on every public table to anon and authenticated,
-- and row-level security doesn't apply to TRUNCATE. 20261024000000 already
-- took away INSERT, UPDATE and DELETE on promotional_usage; this takes away
-- TRUNCATE too.
--
-- Already applied in production on 2026-10-24 (run by hand); this file keeps
-- the repo in step. Safe to re-run.
-- Undo: GRANT TRUNCATE ON public.promotional_usage TO anon, authenticated;

REVOKE TRUNCATE ON public.promotional_usage FROM anon, authenticated;
