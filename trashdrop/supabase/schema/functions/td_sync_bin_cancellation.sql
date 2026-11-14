-- Function public.td_sync_bin_cancellation
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_sync_bin_cancellation(): execute: service_role
CREATE OR REPLACE FUNCTION public.td_sync_bin_cancellation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  new_s text := lower(coalesce(NEW.status, 'pending'));
BEGIN
  IF new_s IN ('cancelled', 'canceled') THEN
    NEW.is_active := false;
  ELSIF TG_OP = 'UPDATE'
        AND lower(coalesce(OLD.status, '')) IN ('cancelled', 'canceled')
        AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.is_active := true;
  ELSIF NEW.is_active IS FALSE
        AND (TG_OP = 'INSERT' OR OLD.is_active IS DISTINCT FROM false)
        AND new_s IN ('pending', 'available', 'accepted', 'en_route', 'arrived') THEN
    NEW.status := 'cancelled';
  END IF;
  RETURN NEW;
END;
$function$;
