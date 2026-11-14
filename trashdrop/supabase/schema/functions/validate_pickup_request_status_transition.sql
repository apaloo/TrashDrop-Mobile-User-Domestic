-- Function public.validate_pickup_request_status_transition
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- validate_pickup_request_status_transition(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.validate_pickup_request_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- Allow same-status updates (no-op transitions)
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Define valid transitions
  CASE NEW.status
    WHEN 'accepted' THEN
      IF OLD.status NOT IN ('pending', 'available') THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
      END IF;
    WHEN 'en_route' THEN
      IF OLD.status NOT IN ('accepted') THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
      END IF;
    WHEN 'arrived' THEN
      IF OLD.status NOT IN ('en_route', 'accepted') THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
      END IF;
    WHEN 'collecting' THEN
      IF OLD.status NOT IN ('arrived', 'en_route', 'accepted') THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
      END IF;
    WHEN 'completed' THEN
      IF OLD.status NOT IN ('collecting', 'arrived') THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
      END IF;
    WHEN 'disposed' THEN
      IF OLD.status NOT IN ('collecting', 'completed', 'arrived') THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
      END IF;
    WHEN 'cancelled' THEN
      IF OLD.status IN ('completed', 'disposed', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
      END IF;
    WHEN 'canceled' THEN
      IF OLD.status IN ('completed', 'disposed', 'cancelled', 'canceled') THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
      END IF;
    WHEN 'expired' THEN
      IF OLD.status NOT IN ('accepted', 'en_route', 'available', 'pending') THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
      END IF;
    WHEN 'pending' THEN
      NULL;
    WHEN 'available' THEN
      NULL;
    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$function$;
