-- Function public.get_collector_assignments
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_collector_assignments(p_collector_id uuid, p_status text, p_limit integer, p_offset integer): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_collector_assignments(p_collector_id uuid, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_result jsonb;
    v_total bigint;
    v_assignments jsonb;
BEGIN
    -- Get total count
    SELECT COUNT(*)
    INTO v_total
    FROM public.pickup_requests
    WHERE collector_id = p_collector_id
    AND (p_status IS NULL OR status = p_status);
    
    -- Get paginated assignments
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'location', location,
            'status', status,
            'created_at', created_at,
            'scheduled_date', scheduled_date,
            'waste_type', waste_type,
            'special_instructions', special_instructions
        )
    ) INTO v_assignments
    FROM public.pickup_requests
    WHERE collector_id = p_collector_id
    AND (p_status IS NULL OR status = p_status)
    ORDER BY 
        CASE 
            WHEN status = 'assigned' THEN 1
            WHEN status = 'in_progress' THEN 2
            ELSE 3
        END,
        created_at
    LIMIT p_limit
    OFFSET p_offset;
    
    -- Build result
    v_result := jsonb_build_object(
        'data', COALESCE(v_assignments, '[]'::jsonb),
        'pagination', jsonb_build_object(
            'total', v_total,
            'limit', p_limit,
            'offset', p_offset
        )
    );
    
    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$function$;
