-- Undo 20261113095112_job_ratings.sql (households rate their collector, issue #186).
--
-- Drops td_rate_job and job_ratings (every rating is lost; export them first
-- if they matter), puts protect_collector_admin_fields back as it was before
-- (rating changes staff-only, no exception), and resets every collector's
-- rating to 0.00 as it was. One transaction.
--
-- Roll back the household app's rating screen first: without td_rate_job it
-- shows an error when a household sends a rating.

BEGIN;

DROP FUNCTION IF EXISTS public.td_rate_job(text, text, integer, text);
DROP TABLE IF EXISTS public.job_ratings;

CREATE OR REPLACE FUNCTION public.protect_collector_admin_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.td_is_staff() THEN
    RETURN NEW; -- service role / backend, or TrashDrop staff
  END IF;

  IF (OLD.status = 'suspended') <> (NEW.status = 'suspended')
     OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at
     OR NEW.deactivated_by IS DISTINCT FROM OLD.deactivated_by
     OR NEW.deactivation_reason IS DISTINCT FROM OLD.deactivation_reason
     OR NEW.pending_balance IS DISTINCT FROM OLD.pending_balance
     OR NEW.withdrawable_balance IS DISTINCT FROM OLD.withdrawable_balance
     OR NEW.rating IS DISTINCT FROM OLD.rating THEN
    RAISE EXCEPTION 'These account fields can only be changed by TrashDrop staff'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

UPDATE public.collector_profiles SET rating = 0.00 WHERE rating IS DISTINCT FROM 0.00;

COMMIT;
