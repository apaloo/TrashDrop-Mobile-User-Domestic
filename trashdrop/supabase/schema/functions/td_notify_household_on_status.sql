-- Function public.td_notify_household_on_status
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_notify_household_on_status(): execute: service_role
CREATE OR REPLACE FUNCTION public.td_notify_household_on_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
