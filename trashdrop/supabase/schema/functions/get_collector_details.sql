-- Function public.get_collector_details
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_collector_details(p_collector_id uuid): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_collector_details(p_collector_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    SELECT 
        jsonb_build_object(
            'id', user_id,
            'first_name', first_name,
            'last_name', last_name,
            'phone', phone,
            'email', (SELECT email FROM auth.users WHERE id = user_id),
            'region', region,
            'vehicle_type', vehicle_type,
            'license_plate', license_plate,
            'company_name', company_name,
            'role', role,
            'status', 'active',
            'created_at', created_at,
            'updated_at', updated_at
        )
    INTO v_result
    FROM public.collector_profiles
    WHERE user_id = p_collector_id;
    
    RETURN COALESCE(v_result, jsonb_build_object('error', 'Collector not found'));
END;
$function$;
