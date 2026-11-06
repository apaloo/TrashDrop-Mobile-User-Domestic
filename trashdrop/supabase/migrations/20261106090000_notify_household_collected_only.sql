-- Stop the duplicate "Waste Disposed" message.
--
-- 20261106010000 made the database tell the household when its waste is
-- collected and when it is disposed. The collector app already writes its own
-- pickup_disposed message, which names the disposal site, a moment after the
-- status change, so every household got two "Waste Disposed" messages. (The
-- 10-minute check could not catch it: the collector app's message arrives
-- after the database's.) All 3 disposals since October got the collector
-- app's message, so the database now sends only "Waste Collected", which
-- nothing else sends.
--
-- Only the function body changes; the triggers from 20261106010000 stay as
-- they are. Pricing rules (CLAUDE.md) are untouched. No data is changed.

SET LOCAL search_path = public;

CREATE OR REPLACE FUNCTION public.td_notify_household_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_what text := CASE WHEN TG_TABLE_NAME = 'digital_bins' THEN 'Your digital bin' ELSE 'Your pickup' END;
BEGIN
  BEGIN
    IF NEW.user_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;

    -- Picked up. "disposed" is left to the collector app, which sends its own.
    IF NOT (NEW.status = 'collecting'
            OR (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'collecting')) THEN
      RETURN NEW;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.user_id = NEW.user_id
         AND n.type = 'pickup_collected'
         AND n.created_at > now() - interval '10 minutes'
    ) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (NEW.user_id, 'Waste Collected ✅',
            v_what || ' has been picked up and is on its way to a disposal site. You''ll be notified when it''s disposed.',
            'pickup_collected', false);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- a notification problem never blocks the status change
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.td_notify_household_on_status() FROM PUBLIC, anon, authenticated;
