-- Function public.trigger_increment_on_pickup_completed
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- trigger_increment_on_pickup_completed(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.trigger_increment_on_pickup_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- Only increment when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    PERFORM public.increment_completed_requests(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$function$;
