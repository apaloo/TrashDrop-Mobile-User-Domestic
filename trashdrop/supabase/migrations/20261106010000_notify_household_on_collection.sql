-- Tell the household when their waste is picked up and when it is disposed.
--
-- The household's Notifications page is a log of messages. The collector app
-- writes one at accept, en route and arrived (and sometimes disposed), but
-- nothing writes one when the waste is picked up, so the list stopped at
-- "Collector Arrived" while the bin card already showed COLLECTED.
--
-- This adds one AFTER UPDATE OF status trigger on digital_bins and
-- pickup_requests that writes the message from the database, whichever app
-- (collector, admin, service role) made the change:
--   collecting              -> pickup_collected  "Waste collected"
--   completed (not from     -> pickup_collected  "Waste collected"
--     collecting)
--   disposed                -> pickup_disposed   "Waste disposed"
-- A message is skipped when the household already got the same type in the
-- last 10 minutes (the collector app sometimes sends pickup_disposed itself),
-- and when the job has no household user (WhatsApp-only bookings).
-- Like td_alert_notify, a notification problem never blocks the status change.
--
-- Pricing rules (CLAUDE.md) are untouched: no pricing function or trigger is
-- redefined; this is a separate trigger that only inserts into notifications.
-- No data is created or changed by the migration itself.

SET LOCAL search_path = public;

CREATE OR REPLACE FUNCTION public.td_notify_household_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_title text;
  v_message text;
  v_what text := CASE WHEN TG_TABLE_NAME = 'digital_bins' THEN 'Your digital bin' ELSE 'Your pickup' END;
BEGIN
  BEGIN
    IF NEW.user_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;

    IF NEW.status = 'collecting'
       OR (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'collecting') THEN
      v_type := 'pickup_collected';
      v_title := 'Waste Collected ✅';
      v_message := v_what || ' has been picked up and is on its way to a disposal site. You''ll be notified when it''s disposed.';
    ELSIF NEW.status = 'disposed' THEN
      v_type := 'pickup_disposed';
      v_title := 'Waste Disposed ♻️';
      v_message := v_what || ' has been delivered to a disposal site. Thank you for using TrashDrop!';
    ELSE
      RETURN NEW;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.user_id = NEW.user_id
         AND n.type = v_type
         AND n.created_at > now() - interval '10 minutes'
    ) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (NEW.user_id, v_title, v_message, v_type, false);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- a notification problem never blocks the status change
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.td_notify_household_on_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS td_notify_household_on_status ON public.digital_bins;
CREATE TRIGGER td_notify_household_on_status
  AFTER UPDATE OF status ON public.digital_bins
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.td_notify_household_on_status();

DROP TRIGGER IF EXISTS td_notify_household_on_status ON public.pickup_requests;
CREATE TRIGGER td_notify_household_on_status
  AFTER UPDATE OF status ON public.pickup_requests
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.td_notify_household_on_status();
