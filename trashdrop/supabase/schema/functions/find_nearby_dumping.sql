-- Function public.find_nearby_dumping
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- find_nearby_dumping(p_latitude numeric, p_longitude numeric, p_radius_km numeric, p_hours_back integer, p_exclude_user_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.find_nearby_dumping(p_latitude numeric, p_longitude numeric, p_radius_km numeric DEFAULT 0.1, p_hours_back integer DEFAULT 24, p_exclude_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, reported_by uuid, location text, coordinates geometry, latitude numeric, longitude numeric, waste_type text, severity text, size text, photos text[], status text, created_at timestamp with time zone, updated_at timestamp with time zone, distance_meters numeric, hours_ago numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.reported_by,
        d.location,
        d.coordinates,
        d.latitude,
        d.longitude,
        d.waste_type,
        d.severity,
        d.size,
        d.photos,
        d.status,
        d.created_at,
        d.updated_at,
        -- Calculate distance using coordinates if available, otherwise lat/lng
        CASE 
            WHEN d.coordinates IS NOT NULL THEN
                ST_Distance(
                    d.coordinates::geography, 
                    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
                )::NUMERIC
            WHEN d.latitude IS NOT NULL AND d.longitude IS NOT NULL THEN
                ST_Distance(
                    ST_SetSRID(ST_MakePoint(d.longitude, d.latitude), 4326)::geography,
                    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
                )::NUMERIC
            ELSE NULL
        END as distance_meters,
        -- Calculate hours ago
        (EXTRACT(EPOCH FROM (NOW() - d.created_at)) / 3600)::NUMERIC as hours_ago
    FROM illegal_dumping_mobile d
    WHERE 
        -- Spatial filter: within radius
        (
            (d.coordinates IS NOT NULL AND ST_DWithin(
                d.coordinates, 
                ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326), 
                p_radius_km * 1000
            ))
            OR
            (d.coordinates IS NULL AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL AND
             ST_DWithin(
                ST_SetSRID(ST_MakePoint(d.longitude, d.latitude), 4326),
                ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326), 
                p_radius_km * 1000
             ))
        )
        -- Time filter: within specified hours
        AND d.created_at > NOW() - INTERVAL '1 hour' * p_hours_back
        -- Optional user exclusion
        AND (p_exclude_user_id IS NULL OR d.reported_by != p_exclude_user_id)
    ORDER BY distance_meters, d.created_at DESC;
END;
$function$;
