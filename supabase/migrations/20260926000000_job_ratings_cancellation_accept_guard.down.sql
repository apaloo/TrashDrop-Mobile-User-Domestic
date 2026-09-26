-- Undo 20260926000000_job_ratings_cancellation_accept_guard.sql
-- ----------------------------------------------------------------------------
-- WARNING: dropping the rating columns deletes every rating households have
-- given. The cancellation backfill (section 2) is not undone: those bins were
-- cancelled by their households and should stay cancelled.

DROP TRIGGER IF EXISTS trg_guard_job_collector ON public.pickup_requests;
DROP TRIGGER IF EXISTS trg_guard_job_collector ON public.digital_bins;
DROP FUNCTION IF EXISTS public.guard_job_collector();

DROP TRIGGER IF EXISTS trg_refresh_collector_rating ON public.pickup_requests;
DROP TRIGGER IF EXISTS trg_refresh_collector_rating ON public.digital_bins;
DROP FUNCTION IF EXISTS public.refresh_collector_rating();

DROP TRIGGER IF EXISTS trg_guard_collector_rating ON public.pickup_requests;
DROP TRIGGER IF EXISTS trg_guard_collector_rating ON public.digital_bins;
DROP FUNCTION IF EXISTS public.guard_collector_rating();

ALTER TABLE public.pickup_requests DROP COLUMN IF EXISTS collector_rating;
ALTER TABLE public.digital_bins DROP COLUMN IF EXISTS collector_rating;
ALTER TABLE public.collector_profiles DROP COLUMN IF EXISTS rating_count;
