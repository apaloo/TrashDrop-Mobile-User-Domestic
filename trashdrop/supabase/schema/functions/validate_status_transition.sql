-- Function public.validate_status_transition
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- validate_status_transition(current_status pickup_status_enum, new_status pickup_status_enum): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.validate_status_transition(current_status pickup_status_enum, new_status pickup_status_enum)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    -- Define valid transitions
    CASE current_status
        WHEN 'pending' THEN
            RETURN new_status IN ('accepted', 'cancelled');
        WHEN 'accepted' THEN
            RETURN new_status IN ('en_route', 'cancelled');
        WHEN 'en_route' THEN
            RETURN new_status IN ('arrived', 'cancelled');
        WHEN 'arrived' THEN
            RETURN new_status IN ('collecting', 'cancelled');
        WHEN 'collecting' THEN
            RETURN new_status IN ('completed', 'cancelled');
        WHEN 'completed' THEN
            RETURN false; -- Terminal state
        WHEN 'cancelled' THEN
            RETURN false; -- Terminal state
        ELSE
            RETURN false;
    END CASE;
END;
$function$;
