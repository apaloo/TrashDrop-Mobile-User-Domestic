-- Function public.lock_batch_pricing
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- lock_batch_pricing(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.lock_batch_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF OLD.is_locked = true THEN
    RAISE EXCEPTION 'Batch is locked. Cannot modify.';
  END IF;
  RETURN NEW;
END;
$function$;
