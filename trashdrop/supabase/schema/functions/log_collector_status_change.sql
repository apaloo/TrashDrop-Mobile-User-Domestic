-- Function public.log_collector_status_change
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- log_collector_status_change(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.log_collector_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  who uuid;
  name text := nullif(btrim(concat_ws(' ', NEW.first_name, NEW.last_name)), '');
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  BEGIN who := auth.uid(); EXCEPTION WHEN OTHERS THEN who := NULL; END;
  BEGIN
    INSERT INTO public.logs (level, source, message, data, user_id, created_at)
    VALUES (
      CASE WHEN lower(NEW.status) = 'active' THEN 'info' ELSE 'warning' END,
      'collectors',
      CASE WHEN lower(NEW.status) = 'active'
        THEN format('Collector %s reactivated', coalesce(name, left(NEW.id::text, 8)))
        ELSE format('Collector %s deactivated%s', coalesce(name, left(NEW.id::text, 8)), coalesce(': ' || NEW.deactivation_reason, ''))
      END,
      jsonb_build_object('collector_id', NEW.id, 'collector_user_id', NEW.user_id,
                         'from', OLD.status, 'to', NEW.status, 'reason', NEW.deactivation_reason),
      who, now());
  EXCEPTION WHEN OTHERS THEN NULL; -- never block a status change because logging failed
  END;
  RETURN NEW;
END;
$function$;
