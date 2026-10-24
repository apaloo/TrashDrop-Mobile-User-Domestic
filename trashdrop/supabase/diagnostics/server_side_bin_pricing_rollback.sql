-- Undo trashdrop/supabase/migrations/20261024000000_server_side_bin_pricing.sql
--
-- Removes the pricing and price-protection triggers, gives customers back
-- insert/update on their own promotional_usage row (the policies from the
-- collector repo's scripts/add-promotional-pricing-columns.sql) and restores
-- increment_promotional_usage() to counting.
--
-- increment_promotional_usage() was only ever defined in production, not in a
-- repo. The body below does what the app expects of it (count one promotion,
-- true if one was left). If the production audit (promo_pricing_audit.sql,
-- check C2) showed a different definition, use that one instead.
BEGIN;
SET LOCAL search_path = public;

DROP TRIGGER IF EXISTS digital_bins_set_price ON public.digital_bins;
DROP TRIGGER IF EXISTS digital_bins_protect_price ON public.digital_bins;
DROP FUNCTION IF EXISTS public.td_set_digital_bin_price();
DROP FUNCTION IF EXISTS public.td_protect_digital_bin_price();
DROP FUNCTION IF EXISTS public.td_price_digital_bin(uuid, double precision, double precision, integer, integer, boolean, boolean);

GRANT INSERT, UPDATE ON public.promotional_usage TO authenticated;

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
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.promotional_usage
  SET used_count = used_count + 1, updated_at = now()
  WHERE user_id = p_user_id AND used_count < max_requests;
  RETURN FOUND;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
