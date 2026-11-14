-- Function public.trigger_increment_on_digital_bin_collected
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- trigger_increment_on_digital_bin_collected(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.trigger_increment_on_digital_bin_collected()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- Only increment when status changes to 'collected'
  IF NEW.status = 'collected' AND (OLD.status IS NULL OR OLD.status != 'collected') THEN
    PERFORM public.increment_completed_requests(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$function$;
