-- Household <-> collector fixes: ratings, cancellation clean-up, accept race
-- ----------------------------------------------------------------------------
-- Run once in the Supabase SQL editor. Safe to re-run. Undo with
-- 20260926000000_job_ratings_cancellation_accept_guard.down.sql
--
-- 1. Ratings. Households rate a finished job 1-5. The rating lives on the job
--    row; a trigger keeps the collector's average and count on
--    collector_profiles, which the collector app reads.
-- 2. Cancellation clean-up. The household app used to cancel a digital bin by
--    clearing is_active only, leaving status 'pending', so the bin stayed on
--    collectors' lists. The apps now set status 'cancelled'; this backfills
--    rows cancelled the old way.
-- 3. Accept guard. Two collectors accepting the same job both "succeeded" and
--    the later one silently took it over. The collector app now accepts
--    conditionally; this trigger also stops older app versions still on phones
--    from moving a job from one collector to another.

-- 1. Ratings -----------------------------------------------------------------

ALTER TABLE public.pickup_requests
  ADD COLUMN IF NOT EXISTS collector_rating smallint
  CHECK (collector_rating BETWEEN 1 AND 5);

ALTER TABLE public.digital_bins
  ADD COLUMN IF NOT EXISTS collector_rating smallint
  CHECK (collector_rating BETWEEN 1 AND 5);

ALTER TABLE public.collector_profiles
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0;

-- Only the household that booked the job may rate it, once, after pickup.
-- auth.uid() is NULL for the service role / SQL editor, which may correct
-- ratings freely.
CREATE OR REPLACE FUNCTION public.guard_collector_rating()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.collector_rating IS NOT DISTINCT FROM OLD.collector_rating
     OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Only the household that booked this job can rate it';
  END IF;
  IF OLD.collector_rating IS NOT NULL THEN
    RAISE EXCEPTION 'This job has already been rated';
  END IF;
  IF NEW.collector_id IS NULL
     OR NEW.status NOT IN ('collecting', 'completed', 'disposed') THEN
    RAISE EXCEPTION 'A job can only be rated after the collector has picked it up';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_collector_rating ON public.pickup_requests;
CREATE TRIGGER trg_guard_collector_rating
  BEFORE UPDATE OF collector_rating ON public.pickup_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_collector_rating();

DROP TRIGGER IF EXISTS trg_guard_collector_rating ON public.digital_bins;
CREATE TRIGGER trg_guard_collector_rating
  BEFORE UPDATE OF collector_rating ON public.digital_bins
  FOR EACH ROW EXECUTE FUNCTION public.guard_collector_rating();

-- Recompute the collector's average across both job tables. SECURITY DEFINER
-- because the household doing the rating cannot write collector_profiles.
CREATE OR REPLACE FUNCTION public.refresh_collector_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg numeric;
  v_count integer;
BEGIN
  IF NEW.collector_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT avg(r), count(*)
    INTO v_avg, v_count
    FROM (
      SELECT collector_rating AS r FROM public.pickup_requests
       WHERE collector_id = NEW.collector_id AND collector_rating IS NOT NULL
      UNION ALL
      SELECT collector_rating FROM public.digital_bins
       WHERE collector_id = NEW.collector_id AND collector_rating IS NOT NULL
    ) AS ratings;

  UPDATE public.collector_profiles
     SET rating = round(COALESCE(v_avg, 0), 2),
         rating_count = v_count
   WHERE user_id = NEW.collector_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_collector_rating ON public.pickup_requests;
CREATE TRIGGER trg_refresh_collector_rating
  AFTER UPDATE OF collector_rating ON public.pickup_requests
  FOR EACH ROW
  WHEN (NEW.collector_rating IS DISTINCT FROM OLD.collector_rating)
  EXECUTE FUNCTION public.refresh_collector_rating();

DROP TRIGGER IF EXISTS trg_refresh_collector_rating ON public.digital_bins;
CREATE TRIGGER trg_refresh_collector_rating
  AFTER UPDATE OF collector_rating ON public.digital_bins
  FOR EACH ROW
  WHEN (NEW.collector_rating IS DISTINCT FROM OLD.collector_rating)
  EXECUTE FUNCTION public.refresh_collector_rating();

-- 2. Cancellation clean-up -----------------------------------------------------

-- Bins the household cancelled the old way (is_active = false) that never got
-- a cancelled status. Collected/finished bins are left alone.
UPDATE public.digital_bins
   SET status = 'cancelled',
       updated_at = now()
 WHERE is_active = false
   AND status IN ('pending', 'available', 'accepted', 'en_route', 'arrived');

-- 3. Accept guard ----------------------------------------------------------------

-- A job may be released (collector_id -> NULL, e.g. an expired assignment) but
-- never handed from one collector straight to another by an app.
CREATE OR REPLACE FUNCTION public.guard_job_collector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.collector_id IS NOT NULL
     AND NEW.collector_id IS NOT NULL
     AND NEW.collector_id IS DISTINCT FROM OLD.collector_id
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Someone else took this job.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_job_collector ON public.pickup_requests;
CREATE TRIGGER trg_guard_job_collector
  BEFORE UPDATE OF collector_id ON public.pickup_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_job_collector();

DROP TRIGGER IF EXISTS trg_guard_job_collector ON public.digital_bins;
CREATE TRIGGER trg_guard_job_collector
  BEFORE UPDATE OF collector_id ON public.digital_bins
  FOR EACH ROW EXECUTE FUNCTION public.guard_job_collector();
