-- Function public.enforce_status_transition
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- enforce_status_transition(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.enforce_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    -- Only validate on update if status is changing
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        IF NOT validate_status_transition(OLD.status::pickup_status_enum, NEW.status::pickup_status_enum) THEN
            RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
        END IF;
    END IF;
    
    -- Auto-set timestamps based on status
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        CASE NEW.status
            WHEN 'accepted' THEN
                NEW.accepted_at = NOW();
            WHEN 'collecting' THEN
                NEW.picked_up_at = NOW();
            WHEN 'completed' THEN
                NEW.disposed_at = NOW();
        END CASE;
    END IF;
    
    RETURN NEW;
END;
$function$;
