-- TD74 (approved by the owner 2026-11-14, "Approve the TD74 database rule"):
-- a digital bin's cancellation is two columns, status and is_active, and each
-- writer set only one. The household list cancelled with is_active = false
-- alone, so the bin stayed 'pending' and was still offered to collectors;
-- other writers set status = 'cancelled' and left is_active = true, so the
-- household list showed the bin as Active. This keeps the two in step on
-- every write, from any app, WhatsApp or the admin site:
--   - status cancelled                        -> is_active false
--   - is_active false while still cancellable -> status cancelled
--     (pending, available, accepted, en_route, arrived: the statuses the
--     status-flow rule lets a bin be cancelled from)
--   - status moved out of cancelled (an admin reopening it) -> is_active true
-- A bin being collected or done keeps its status whatever is_active says.
-- td_refund_promotion_on_cancel (protected, unchanged) already counts either
-- column as cancelled, so cancelling refunds a promotion exactly as before,
-- and reopening a bin now takes it again, as DIGITAL_BIN_PRICING.md says.
-- Named aa_ so it runs before the other BEFORE triggers.
CREATE OR REPLACE FUNCTION public.td_sync_bin_cancellation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  new_s text := lower(coalesce(NEW.status, 'pending'));
BEGIN
  IF new_s IN ('cancelled', 'canceled') THEN
    NEW.is_active := false;
  ELSIF TG_OP = 'UPDATE'
        AND lower(coalesce(OLD.status, '')) IN ('cancelled', 'canceled')
        AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.is_active := true;
  ELSIF NEW.is_active IS FALSE
        AND (TG_OP = 'INSERT' OR OLD.is_active IS DISTINCT FROM false)
        AND new_s IN ('pending', 'available', 'accepted', 'en_route', 'arrived') THEN
    NEW.status := 'cancelled';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.td_sync_bin_cancellation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER aa_td_sync_bin_cancellation BEFORE INSERT OR UPDATE ON public.digital_bins
  FOR EACH ROW EXECUTE FUNCTION public.td_sync_bin_cancellation();
