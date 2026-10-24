-- Cancelling a promotional bin from the app gives the promotion back.
--
-- 20261024000000 refunds a promotion when a bin's status becomes cancelled.
-- The app's Cancel button (My Digital Bins) doesn't change the status: it
-- sets is_active = false, and the app lists a bin as cancelled when it is
-- inactive and not completed (digitalBinService.transformBin). So promotions
-- cancelled from the app were not given back.
--
-- A bin now counts as cancelled when its status is cancelled/canceled, or it
-- is inactive and not completed/disposed. The trigger also watches is_active.
-- As before, a bin that stops being cancelled takes the promotion again, so
-- cancelling and reactivating can't add promotions.
--
-- Also labels the pricing functions and triggers as the accepted TrashDrop
-- Digital Bin Pricing (docs/DIGITAL_BIN_PRICING.md).
-- Safe to re-run. One transaction.
-- Undo: re-run the td_refund_promotion_on_cancel() section and trigger of
-- 20261024000000_server_side_bin_pricing.sql.

BEGIN;
SET LOCAL search_path = public;

CREATE OR REPLACE FUNCTION public.td_refund_promotion_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  was_cancelled boolean := lower(coalesce(OLD.status, '')) IN ('cancelled', 'canceled')
    OR (OLD.is_active IS FALSE AND lower(coalesce(OLD.status, '')) NOT IN ('completed', 'disposed'));
  is_cancelled boolean := lower(coalesce(NEW.status, '')) IN ('cancelled', 'canceled')
    OR (NEW.is_active IS FALSE AND lower(coalesce(NEW.status, '')) NOT IN ('completed', 'disposed'));
BEGIN
  IF NOT coalesce(NEW.is_promotional, false) OR NEW.user_id IS NULL OR was_cancelled = is_cancelled THEN
    RETURN NEW;
  END IF;

  UPDATE public.promotional_usage u
  SET used_count = CASE WHEN is_cancelled THEN greatest(u.used_count - 1, 0)
                        ELSE least(u.used_count + 1, u.max_requests) END,
      updated_at = now()
  WHERE u.user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.td_refund_promotion_on_cancel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS digital_bins_refund_promotion ON public.digital_bins;
CREATE TRIGGER digital_bins_refund_promotion
  AFTER UPDATE OF status, is_active ON public.digital_bins
  FOR EACH ROW
  EXECUTE FUNCTION public.td_refund_promotion_on_cancel();

-- Mark the accepted pricing objects, so anyone reading the database sees it
COMMENT ON FUNCTION public.td_price_digital_bin(uuid, double precision, double precision, integer, integer, boolean, boolean) IS
  'Accepted TrashDrop Digital Bin Pricing (2026-10-24). Do not change without the owner''s approval; see docs/DIGITAL_BIN_PRICING.md in TrashDrop-Mobile-User-Domestic.';
COMMENT ON FUNCTION public.td_set_digital_bin_price() IS
  'Accepted TrashDrop Digital Bin Pricing: prices every new digital bin. Do not change without the owner''s approval; see docs/DIGITAL_BIN_PRICING.md.';
COMMENT ON FUNCTION public.td_protect_digital_bin_price() IS
  'Accepted TrashDrop Digital Bin Pricing: customers cannot reprice their bins. Do not change without the owner''s approval; see docs/DIGITAL_BIN_PRICING.md.';
COMMENT ON FUNCTION public.td_refund_promotion_on_cancel() IS
  'Accepted TrashDrop Digital Bin Pricing: cancelling a promotional bin gives the promotion back. Do not change without the owner''s approval; see docs/DIGITAL_BIN_PRICING.md.';
COMMENT ON TRIGGER digital_bins_set_price ON public.digital_bins IS 'Accepted TrashDrop Digital Bin Pricing; see docs/DIGITAL_BIN_PRICING.md.';
COMMENT ON TRIGGER digital_bins_protect_price ON public.digital_bins IS 'Accepted TrashDrop Digital Bin Pricing; see docs/DIGITAL_BIN_PRICING.md.';
COMMENT ON TRIGGER digital_bins_refund_promotion ON public.digital_bins IS 'Accepted TrashDrop Digital Bin Pricing; see docs/DIGITAL_BIN_PRICING.md.';

COMMIT;
