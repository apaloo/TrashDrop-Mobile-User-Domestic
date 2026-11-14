-- Function public.list_collectors
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- list_collectors(p_limit integer, p_offset integer, p_status text, p_region text, p_search text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.list_collectors(p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_status text DEFAULT NULL::text, p_region text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, first_name text, last_name text, phone text, email text, region text, vehicle_type text, license_plate text, status text, created_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    WITH collector_data AS (
        SELECT 
            cp.user_id as id,
            cp.first_name,
            cp.last_name,
            cp.phone,
            u.email,
            cp.region,
            cp.vehicle_type,
            cp.license_plate,
            'active' as status,
            cp.created_at,
            COUNT(*) OVER() as total_count
        FROM 
            public.collector_profiles cp
        JOIN 
            auth.users u ON cp.user_id = u.id
        WHERE 
            (p_status IS NULL OR 'active' = p_status)
            AND (p_region IS NULL OR cp.region ILIKE '%' || p_region || '%')
            AND (p_search IS NULL OR 
                 cp.first_name ILIKE '%' || p_search || '%' OR
                 cp.last_name ILIKE '%' || p_search || '%' OR
                 cp.phone ILIKE '%' || p_search || '%' OR
                 u.email ILIKE '%' || p_search || '%')
        ORDER BY 
            cp.first_name, cp.last_name
        LIMIT 
            p_limit
        OFFSET 
            p_offset
    )
    SELECT 
        id,
        first_name,
        last_name,
        phone,
        email,
        region,
        vehicle_type,
        license_plate,
        status,
        created_at,
        (SELECT total_count FROM collector_data LIMIT 1) as total_count
    FROM 
        collector_data;
END;
$function$;
