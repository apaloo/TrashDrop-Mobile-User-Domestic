-- Function public.enforce_pickup_status_flow
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- enforce_pickup_status_flow(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.enforce_pickup_status_flow()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  old_s text := lower(coalesce(OLD.status, 'pending'));
  new_s text := lower(coalesce(NEW.status, 'pending'));
  collector text := coalesce(to_jsonb(NEW) ->> 'collector_id', to_jsonb(NEW) ->> 'assigned_to');
  canon_old text;
  canon_new text;
BEGIN
  IF coalesce(current_setting('app.skip_status_flow', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- Map aliases to canonical statuses
  canon_old := CASE
    WHEN old_s IN ('available', 'new', 'requested', 'open') THEN 'pending'
    WHEN old_s IN ('assigned', 'confirmed', 'reserved') THEN 'accepted'
    WHEN old_s IN ('in_transit', 'started', 'in_progress') THEN 'en_route'
    WHEN old_s = 'picked_up' THEN 'collecting'
    WHEN old_s IN ('canceled', 'rejected', 'declined') THEN 'cancelled'
    ELSE old_s END;
  canon_new := CASE
    WHEN new_s IN ('available', 'new', 'requested', 'open') THEN 'pending'
    WHEN new_s IN ('assigned', 'confirmed', 'reserved') THEN 'accepted'
    WHEN new_s IN ('in_transit', 'started', 'in_progress') THEN 'en_route'
    WHEN new_s = 'picked_up' THEN 'collecting'
    WHEN new_s IN ('canceled', 'rejected', 'declined') THEN 'cancelled'
    ELSE new_s END;

  -- A collector must be assigned for every in-progress status
  IF canon_new IN ('accepted', 'en_route', 'arrived', 'collecting') AND collector IS NULL THEN
    RAISE EXCEPTION 'Status % needs an assigned collector (collector_id)', new_s
      USING ERRCODE = 'check_violation';
  END IF;

  IF canon_old = canon_new THEN
    RETURN NEW;
  END IF;

  IF (canon_old, canon_new) IN (
    ('pending', 'accepted'), ('pending', 'cancelled'), ('pending', 'expired'),
    ('accepted', 'en_route'), ('accepted', 'arrived'), ('accepted', 'collecting'),
    ('accepted', 'pending'), ('accepted', 'cancelled'), ('accepted', 'expired'),
    ('en_route', 'arrived'), ('en_route', 'collecting'), ('en_route', 'cancelled'), ('en_route', 'expired'),
    ('arrived', 'collecting'), ('arrived', 'completed'), ('arrived', 'disposed'), ('arrived', 'cancelled'),
    ('collecting', 'completed'), ('collecting', 'disposed'),
    ('completed', 'disposed')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Status cannot change from % to %', old_s, new_s
    USING ERRCODE = 'check_violation',
          HINT = 'Allowed: pending → accepted → en_route → arrived → collecting → completed/disposed; cancel only before collecting.';
END;
$function$;
