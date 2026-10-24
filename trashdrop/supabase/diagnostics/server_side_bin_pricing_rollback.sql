-- Undo trashdrop/supabase/migrations/20261024000000_server_side_bin_pricing.sql
--
-- Removes the pricing and price-protection triggers, gives customers back
-- insert/update on their own promotional_usage row (the policies from the
-- collector repo's scripts/add-promotional-pricing-columns.sql) and restores
-- increment_promotional_usage() to counting.
--
-- increment_promotional_usage() is restored exactly as production had it
-- before the migration (production audit 2026-10-24, check C2): plpgsql,
-- not SECURITY DEFINER, so it relies on promotional_usage_update_own.
BEGIN;
SET LOCAL search_path = public;

DROP TRIGGER IF EXISTS digital_bins_set_price ON public.digital_bins;
DROP TRIGGER IF EXISTS digital_bins_protect_price ON public.digital_bins;
DROP FUNCTION IF EXISTS public.td_set_digital_bin_price();
DROP FUNCTION IF EXISTS public.td_protect_digital_bin_price();
DROP FUNCTION IF EXISTS public.td_price_digital_bin(uuid, double precision, double precision, integer, integer, boolean, boolean);

GRANT INSERT, UPDATE, DELETE ON public.promotional_usage TO anon, authenticated;

DROP POLICY IF EXISTS promotional_usage_insert_own ON public.promotional_usage;
CREATE POLICY promotional_usage_insert_own
  ON public.promotional_usage FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS promotional_usage_update_own ON public.promotional_usage;
CREATE POLICY promotional_usage_update_own
  ON public.promotional_usage FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.increment_promotional_usage(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  current_count integer;
  max_count integer;
BEGIN
  SELECT used_count, max_requests INTO current_count, max_count
  FROM promotional_usage WHERE user_id = p_user_id FOR UPDATE;

  IF current_count IS NULL THEN RETURN false; END IF;
  IF current_count >= max_count THEN RETURN false; END IF;

  UPDATE promotional_usage
  SET used_count = used_count + 1, updated_at = now()
  WHERE user_id = p_user_id;
  RETURN true;
END;
$function$;
-- CREATE OR REPLACE keeps the SECURITY DEFINER / search_path the migration set
ALTER FUNCTION public.increment_promotional_usage(uuid) SECURITY INVOKER RESET ALL;
-- the migration's version was STABLE
ALTER FUNCTION public.increment_promotional_usage(uuid) VOLATILE;

NOTIFY pgrst, 'reload schema';
COMMIT;
