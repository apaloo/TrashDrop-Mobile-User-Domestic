-- Digital bins are priced by the database, and promotions are counted when
-- the bin is saved.
--
-- Until now the app (and the WhatsApp function) worked out the fee, the
-- collector payout and whether the booking was promotional, and the database
-- stored whatever it was sent. The promotion allowance was counted by a
-- separate call after the bin was saved, which WhatsApp bookings never made,
-- and customers could edit their own promotional_usage row.
--
-- From now on:
--   1. A BEFORE INSERT trigger prices every new digital bin, overwriting the
--      fee, payout and promotion fields the client sent:
--        promotional  not urgent, the customer still has promotions left and
--                     the bin size has an active promotional_fee_schedule row:
--                     fee = client_fee × bags, payout = collector_payout × bags,
--                     and one promotion is used up in the same statement
--        otherwise    zone price for the size × bags (+30% urgent) + GHS 1;
--                     payout = base + urgent
--      A location or size that can't be priced is refused (TDC02), as the app
--      already does before saving.
--   2. The customer who booked a bin can't change its price or promotion
--      fields afterwards (collectors still record payouts at disposal; staff
--      and the backend are unaffected).
--   3. Cancelling a promotional bin gives the promotion back (reopening a
--      cancelled one takes it again, so a cancel/reopen loop can't add any).
--   4. Customers can read their promotional_usage row but no longer insert,
--      update or delete it. increment_promotional_usage() no longer counts
--      (the trigger does); it only reports whether the user can still get a
--      promotion, so older app versions that still call it don't double count.
--
-- Bypass for backend data fixes only (ignored for signed-in users):
--   SET LOCAL trashdrop.skip_bin_pricing = 'on';
--
-- Safe to re-run. One transaction.
-- Undo: trashdrop/supabase/diagnostics/server_side_bin_pricing_rollback.sql

BEGIN;
SET LOCAL search_path = public;

-- 1. The price of a bin --------------------------------------------------------
-- p_claim = true uses up one promotion when the booking qualifies.
CREATE OR REPLACE FUNCTION public.td_price_digital_bin(
  p_user_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_bin_size_liters integer,
  p_bag_count integer,
  p_is_urgent boolean,
  p_claim boolean DEFAULT false
)
RETURNS TABLE (
  fee numeric,
  collector_core_payout numeric,
  collector_urgent_payout numeric,
  collector_total_payout numeric,
  is_promotional boolean,
  promo_request_number integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bags integer := greatest(1, coalesce(p_bag_count, 1));
  v_size integer := coalesce(p_bin_size_liters, 120);
  v_client_fee numeric;
  v_collector_payout numeric;
  v_used integer;
  v_zone_price numeric;
  v_base numeric;
  v_urgent numeric;
BEGIN
  -- Promotions: not for urgent bookings
  IF p_user_id IS NOT NULL AND NOT coalesce(p_is_urgent, false) THEN
    SELECT s.client_fee, s.collector_payout INTO v_client_fee, v_collector_payout
    FROM public.promotional_fee_schedule s
    WHERE s.bin_size_liters = v_size AND s.is_active
    ORDER BY s.client_fee
    LIMIT 1;

    IF v_client_fee IS NOT NULL THEN
      IF p_claim THEN
        UPDATE public.promotional_usage u
        SET used_count = u.used_count + 1, updated_at = now()
        WHERE u.user_id = p_user_id AND u.used_count < u.max_requests
        RETURNING u.used_count INTO v_used;
      ELSE
        SELECT u.used_count + 1 INTO v_used
        FROM public.promotional_usage u
        WHERE u.user_id = p_user_id AND u.used_count < u.max_requests;
      END IF;

      IF v_used IS NOT NULL THEN
        RETURN QUERY SELECT
          round(v_client_fee * v_bags, 2),
          round(coalesce(v_collector_payout, v_client_fee) * v_bags, 2),
          0::numeric,
          round(coalesce(v_collector_payout, v_client_fee) * v_bags, 2),
          true,
          v_used;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- Standard pricing: the zone covering the location, no default price
  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    SELECT nullif((to_jsonb(z) ->> ('price_' || v_size || 'l')), '')::numeric INTO v_zone_price
    FROM public.get_covering_pricing_zone(p_latitude, p_longitude) z
    LIMIT 1;
  END IF;

  IF v_zone_price IS NULL OR v_zone_price <= 0 THEN
    RAISE EXCEPTION 'We can''t price a % L bin at this location', v_size
      USING ERRCODE = 'TDC02',
            DETAIL = format('latitude=%s longitude=%s bin_size_liters=%s', p_latitude, p_longitude, v_size);
  END IF;

  v_base := v_zone_price * v_bags;
  v_urgent := CASE WHEN coalesce(p_is_urgent, false) THEN v_base * 0.30 ELSE 0 END;

  RETURN QUERY SELECT
    round(v_base + v_urgent + 1.00, 2),
    round(v_base, 2),
    round(v_urgent, 2),
    round(v_base + v_urgent, 2),
    false,
    NULL::integer;
END;
$$;

REVOKE ALL ON FUNCTION public.td_price_digital_bin(uuid, double precision, double precision, integer, integer, boolean, boolean) FROM PUBLIC, anon, authenticated;

-- 2. Price every new bin ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.td_set_digital_bin_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latitude double precision;
  v_longitude double precision;
  p record;
BEGIN
  IF auth.uid() IS NULL AND current_setting('trashdrop.skip_bin_pricing', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT ST_Y(bl.coordinates::geometry), ST_X(bl.coordinates::geometry)
  INTO v_latitude, v_longitude
  FROM public.bin_locations bl
  WHERE bl.id = NEW.location_id;

  SELECT * INTO p
  FROM public.td_price_digital_bin(NEW.user_id, v_latitude, v_longitude,
                                   NEW.bin_size_liters, NEW.bag_count, NEW.is_urgent, true);

  NEW.fee := p.fee;
  NEW.is_promotional := p.is_promotional;
  NEW.promo_request_number := p.promo_request_number;
  NEW.collector_core_payout := p.collector_core_payout;
  NEW.collector_urgent_payout := p.collector_urgent_payout;
  NEW.collector_distance_payout := 0;
  NEW.collector_surge_payout := 0;
  NEW.collector_total_payout := p.collector_total_payout;
  NEW.surge_multiplier := 1.0;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.td_set_digital_bin_price() FROM PUBLIC, anon, authenticated;

-- Runs after digital_bins_enforce_coverage (BEFORE triggers fire in name order)
DROP TRIGGER IF EXISTS digital_bins_set_price ON public.digital_bins;
CREATE TRIGGER digital_bins_set_price
  BEFORE INSERT ON public.digital_bins
  FOR EACH ROW
  EXECUTE FUNCTION public.td_set_digital_bin_price();

-- 3. The customer can't reprice their own bin later ---------------------------
CREATE OR REPLACE FUNCTION public.td_protect_digital_bin_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = OLD.user_id
     AND (NEW.fee IS DISTINCT FROM OLD.fee
       OR NEW.is_promotional IS DISTINCT FROM OLD.is_promotional
       OR NEW.promo_request_number IS DISTINCT FROM OLD.promo_request_number
       OR NEW.bag_count IS DISTINCT FROM OLD.bag_count
       OR NEW.bin_size_liters IS DISTINCT FROM OLD.bin_size_liters
       OR NEW.is_urgent IS DISTINCT FROM OLD.is_urgent
       OR NEW.collector_core_payout IS DISTINCT FROM OLD.collector_core_payout
       OR NEW.collector_urgent_payout IS DISTINCT FROM OLD.collector_urgent_payout
       OR NEW.collector_total_payout IS DISTINCT FROM OLD.collector_total_payout) THEN
    RAISE EXCEPTION 'A booking''s price, size and bags can''t be changed after it is made'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS digital_bins_protect_price ON public.digital_bins;
CREATE TRIGGER digital_bins_protect_price
  BEFORE UPDATE ON public.digital_bins
  FOR EACH ROW
  EXECUTE FUNCTION public.td_protect_digital_bin_price();

-- 4. A cancelled promotional bin gives its promotion back ---------------------
CREATE OR REPLACE FUNCTION public.td_refund_promotion_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  was_cancelled boolean := lower(coalesce(OLD.status, '')) IN ('cancelled', 'canceled');
  is_cancelled boolean := lower(coalesce(NEW.status, '')) IN ('cancelled', 'canceled');
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
  AFTER UPDATE OF status ON public.digital_bins
  FOR EACH ROW
  EXECUTE FUNCTION public.td_refund_promotion_on_cancel();

-- 5. Customers can only read their promotion allowance -----------------------
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'public.promotional_usage'::regclass AND polcmd <> 'r'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.promotional_usage', pol.polname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS promotional_usage_select_own ON public.promotional_usage;
CREATE POLICY promotional_usage_select_own
  ON public.promotional_usage
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.promotional_usage FROM anon, authenticated;

-- 6. The old counting call no longer counts -----------------------------------
-- Same signature as before; true while the user can still get a promotion.
CREATE OR REPLACE FUNCTION public.increment_promotional_usage(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT u.used_count < u.max_requests
                   FROM public.promotional_usage u
                   WHERE u.user_id = p_user_id AND p_user_id = auth.uid()), false)
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
