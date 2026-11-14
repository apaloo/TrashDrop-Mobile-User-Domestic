-- Function public.sync_pickup_request_location
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- sync_pickup_request_location(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.sync_pickup_request_location()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    -- When a pickup request is inserted or updated, sync location from user's default location
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Only update if user_id is provided and location coordinates should be synced
        IF NEW.user_id IS NOT NULL THEN
            -- Get the most recent location for this user (prefer default location, fallback to most recent)
            SELECT 
                CONCAT('POINT(', longitude, ' ', latitude, ')'),
                address
            INTO NEW.location, NEW.address
            FROM locations 
            WHERE user_id = NEW.user_id 
            AND latitude IS NOT NULL 
            AND longitude IS NOT NULL
            ORDER BY is_default DESC, updated_at DESC
            LIMIT 1;
            
            -- Also update the coordinates field (geography type)
            IF NEW.location IS NOT NULL THEN
                NEW.coordinates := ST_SetSRID(ST_MakePoint(
                    CAST(SPLIT_PART(NEW.location, ' ', 2) AS NUMERIC),
                    CAST(SPLIT_PART(SPLIT_PART(NEW.location, ' ', 1), '(', 2) AS NUMERIC)
                ), 4326);
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$;
