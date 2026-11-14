-- Function public.get_nearby_collectors
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_nearby_collectors(p_latitude numeric, p_longitude numeric, p_radius_km integer, p_limit integer): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_nearby_collectors(p_latitude numeric, p_longitude numeric, p_radius_km integer DEFAULT 10, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    -- In a real implementation, you would query collectors within the specified radius
    -- This is a simplified placeholder
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', cp.user_id,
            'first_name', cp.first_name,
            'last_name', cp.last_name,
            'phone', cp.phone,
            'vehicle_type', cp.vehicle_type,
            'distance_km', RANDOM() * p_radius_km, -- Placeholder for actual distance calculation
            'is_available', true -- Placeholder for actual availability check
        )
    ) INTO v_result
    FROM public.collector_profiles cp
    LIMIT p_limit;
    
    RETURN jsonb_build_object(
        'count', COALESCE(jsonb_array_length(v_result), 0),
        'collectors', COALESCE(v_result, '[]'::jsonb)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$function$;
