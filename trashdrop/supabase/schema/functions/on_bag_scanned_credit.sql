-- Function public.on_bag_scanned_credit
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- on_bag_scanned_credit(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.on_bag_scanned_credit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status = 'scanned' AND OLD.status IS DISTINCT FROM 'scanned' THEN

    UPDATE collector_profiles
    SET pending_balance = pending_balance + NEW.unit_price
    WHERE id = NEW.collector_id;

    NEW.collector_credited_at = now();

  END IF;

  RETURN NEW;
END;
$function$;
