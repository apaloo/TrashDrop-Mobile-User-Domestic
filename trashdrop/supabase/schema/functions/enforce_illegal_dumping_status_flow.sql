-- Function public.enforce_illegal_dumping_status_flow
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- enforce_illegal_dumping_status_flow(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.enforce_illegal_dumping_status_flow()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  old_s text := lower(trim(coalesce(OLD.status, 'pending')));
  new_s text := lower(trim(coalesce(NEW.status, 'pending')));
BEGIN
  IF old_s = new_s OR coalesce(current_setting('app.skip_status_flow', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF (old_s, new_s) IN (
    ('pending', 'verified'), ('pending', 'cancelled'),
    ('verified', 'in_progress'), ('verified', 'cancelled'),
    ('in_progress', 'completed'), ('in_progress', 'cancelled'),
    ('completed', 'disposed')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Status cannot change from % to %', old_s, new_s
    USING ERRCODE = 'check_violation',
          HINT = 'Allowed: pending → verified → in_progress → completed → disposed; cancel from pending, verified or in_progress.';
END;
$function$;
