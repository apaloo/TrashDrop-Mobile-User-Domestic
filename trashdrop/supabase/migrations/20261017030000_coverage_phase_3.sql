-- Coverage waitlist (service coverage, Phase 3).
--
-- One row per customer and place (within 500 m) that was refused for being
-- outside coverage:
--   - app users who tap "Notify me" (wants_notification = true)
--   - WhatsApp customers, recorded as demand only, since WhatsApp launch
--     messages need a Meta-approved template that does not exist yet
-- get_my_coverage_arrivals() reports a waitlisted place once it is covered, so
-- the app can show "we've arrived" when the customer next opens it. The in-app
-- alerts table is not used: the app currently does not read it.
--
-- Applied to production on 2026-10-17. The active-collector rule that was
-- first drafted alongside it lives in 20261017040000_require_active_collector.sql
-- and has not been applied.

-- Waitlist ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coverage_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_user_id UUID REFERENCES public.whatsapp_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('app', 'whatsapp')),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  address TEXT,
  wants_notification BOOLEAN NOT NULL DEFAULT false,
  -- Nearest staffed zone when the customer was refused, for expansion planning
  nearest_zone_id UUID REFERENCES public.pricing_zones(id) ON DELETE SET NULL,
  nearest_zone_km NUMERIC,
  request_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when the customer acts on the "we've arrived" banner
  closed_at TIMESTAMPTZ,
  close_reason TEXT CHECK (close_reason IN ('booked', 'dismissed')),
  CHECK (user_id IS NOT NULL OR whatsapp_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_coverage_waitlist_open_user
  ON public.coverage_waitlist(user_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_coverage_waitlist_open_whatsapp
  ON public.coverage_waitlist(whatsapp_user_id) WHERE closed_at IS NULL;

ALTER TABLE public.coverage_waitlist ENABLE ROW LEVEL SECURITY;

-- Customers can read their own entries; all writes go through the functions below
DROP POLICY IF EXISTS "Users can view their own waitlist entries" ON public.coverage_waitlist;
CREATE POLICY "Users can view their own waitlist entries"
  ON public.coverage_waitlist
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.coverage_waitlist FROM anon;

-- Record (or refresh) demand for a place. Repeat requests from the same
-- customer within 500 m of an open entry bump that entry instead of adding one.
CREATE OR REPLACE FUNCTION public.record_coverage_demand(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_channel TEXT,
  p_user_id UUID DEFAULT NULL,
  p_whatsapp_user_id UUID DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_wants_notification BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_nearest RECORD;
BEGIN
  IF p_user_id IS NULL AND p_whatsapp_user_id IS NULL THEN
    RAISE EXCEPTION 'A user or WhatsApp user is required';
  END IF;

  SELECT w.id INTO v_id
  FROM public.coverage_waitlist w
  WHERE w.closed_at IS NULL
    AND ((p_user_id IS NOT NULL AND w.user_id = p_user_id)
      OR (p_user_id IS NULL AND w.whatsapp_user_id = p_whatsapp_user_id))
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(w.longitude, w.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
      500
    )
  ORDER BY w.created_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.coverage_waitlist
    SET request_count = request_count + 1,
        last_requested_at = now(),
        wants_notification = wants_notification OR p_wants_notification,
        address = COALESCE(p_address, address)
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  SELECT c.zone_id, c.distance_km INTO v_nearest
  FROM public.check_service_coverage(p_latitude, p_longitude) c;

  INSERT INTO public.coverage_waitlist (
    user_id, whatsapp_user_id, channel, latitude, longitude, address,
    wants_notification, nearest_zone_id, nearest_zone_km
  ) VALUES (
    p_user_id, p_whatsapp_user_id, p_channel, p_latitude, p_longitude, p_address,
    p_wants_notification, v_nearest.zone_id, v_nearest.distance_km
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_coverage_demand(DOUBLE PRECISION, DOUBLE PRECISION, TEXT, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_coverage_demand(DOUBLE PRECISION, DOUBLE PRECISION, TEXT, UUID, UUID, TEXT, BOOLEAN) TO service_role;

-- "Notify me" from the app, always for the signed-in customer
CREATE OR REPLACE FUNCTION public.join_coverage_waitlist(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_address TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to join the waitlist' USING ERRCODE = '42501';
  END IF;

  RETURN public.record_coverage_demand(
    p_latitude, p_longitude, 'app', auth.uid(), NULL, p_address, true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.join_coverage_waitlist(DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_coverage_waitlist(DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO authenticated;

-- The signed-in customer's waitlisted places that are now covered
CREATE OR REPLACE FUNCTION public.get_my_coverage_arrivals()
RETURNS TABLE (
  waitlist_id UUID,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  suburb VARCHAR,
  district VARCHAR
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.id, w.address, w.latitude, w.longitude, c.suburb, c.district
  FROM public.coverage_waitlist w
  CROSS JOIN LATERAL public.check_service_coverage(w.latitude, w.longitude) c
  WHERE w.user_id = auth.uid()
    AND w.wants_notification
    AND w.closed_at IS NULL
    AND c.is_covered
  ORDER BY w.created_at;
$$;

REVOKE ALL ON FUNCTION public.get_my_coverage_arrivals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_coverage_arrivals() TO authenticated;

-- The customer acted on the banner: booked a pickup, or dismissed it
CREATE OR REPLACE FUNCTION public.close_coverage_waitlist_entry(
  p_waitlist_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.coverage_waitlist
  SET closed_at = now(),
      close_reason = p_reason
  WHERE id = p_waitlist_id
    AND user_id = auth.uid()
    AND closed_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.close_coverage_waitlist_entry(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_coverage_waitlist_entry(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
