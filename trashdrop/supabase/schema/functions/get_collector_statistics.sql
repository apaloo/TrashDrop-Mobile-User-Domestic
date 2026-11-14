-- Function public.get_collector_statistics
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_collector_statistics(p_collector_id uuid): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_collector_statistics(p_collector_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_result jsonb;
    v_total_pickups bigint;
    v_completed_pickups bigint;
    v_avg_rating numeric;
    v_recent_activity jsonb;
BEGIN
    -- Get total pickups
    SELECT COUNT(*) INTO v_total_pickups
    FROM public.pickup_requests
    WHERE collector_id = p_collector_id;
    
    -- Get completed pickups
    SELECT COUNT(*) INTO v_completed_pickups
    FROM public.pickup_requests
    WHERE collector_id = p_collector_id AND status = 'completed';
    
    -- Get average rating (placeholder - implement actual rating logic)
    v_avg_rating := 4.5;
    
    -- Get recent activity
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'type', 'pickup',
            'status', status,
            'created_at', created_at
        )
    ) INTO v_recent_activity
    FROM public.pickup_requests
    WHERE collector_id = p_collector_id
    ORDER BY created_at DESC
    LIMIT 5;
    
    -- Build result
    v_result := jsonb_build_object(
        'total_pickups', v_total_pickups,
        'completed_pickups', v_completed_pickups,
        'completion_rate', CASE WHEN v_total_pickups > 0 
                              THEN ROUND((v_completed_pickups::numeric / v_total_pickups) * 100, 2) 
                              ELSE 0 END,
        'average_rating', v_avg_rating,
        'recent_activity', COALESCE(v_recent_activity, '[]'::jsonb)
    );
    
    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$function$;
