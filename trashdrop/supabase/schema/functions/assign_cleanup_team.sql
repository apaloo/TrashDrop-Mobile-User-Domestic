-- Function public.assign_cleanup_team
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- assign_cleanup_team(p_dumping_id uuid, p_team_id uuid, p_updated_by uuid, p_scheduled_date timestamp with time zone): execute: service_role
CREATE OR REPLACE FUNCTION public.assign_cleanup_team(p_dumping_id uuid, p_team_id uuid, p_updated_by uuid, p_scheduled_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_history_id UUID;
    v_new_status TEXT;
BEGIN
    -- Determine the new status
    v_new_status := CASE 
        WHEN p_scheduled_date IS NOT NULL THEN 'cleanup_scheduled'
        ELSE 'team_assigned'
    END;
    
    -- Update the illegal_dumping record
    UPDATE public.illegal_dumping
    SET 
        assigned_to = p_team_id,
        status = v_new_status,
        updated_at = NOW()
    WHERE id = p_dumping_id;
    
    -- Create a history record if the history table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'illegal_dumping_history') THEN
        INSERT INTO public.illegal_dumping_history(
            report_id,
            status,
            changed_by,
            notes,
            created_at
        )
        VALUES (
            p_dumping_id,
            v_new_status,
            p_updated_by,
            'Assigned to cleanup team',
            NOW()
        )
        RETURNING id INTO v_history_id;
    END IF;
    
    RETURN COALESCE(v_history_id, p_dumping_id);
END;
$function$;

-- assign_cleanup_team(p_report_id uuid, p_collector_id uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.assign_cleanup_team(p_report_id uuid, p_collector_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  updated_count int;
  result jsonb;
BEGIN
  UPDATE public.illegal_dumping_mobile
  SET status = 'in_progress',
      updated_at = now()
  WHERE id = p_report_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  result := jsonb_build_object(
    'success', updated_count > 0,
    'message', CASE WHEN updated_count > 0 THEN 'Cleanup team assigned successfully' ELSE 'Report not found' END,
    'report_id', p_report_id,
    'collector_id', p_collector_id
  );

  RETURN result;
END;
$function$;

-- assign_cleanup_team(p_report_id uuid, p_collector_id uuid, p_assigned_by uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.assign_cleanup_team(p_report_id uuid, p_collector_id uuid, p_assigned_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_result jsonb;
    v_collector_name text;
BEGIN
    -- Fetch collector name from collector_profiles
    SELECT first_name || ' ' || last_name
      INTO v_collector_name
    FROM public.collector_profiles
    WHERE id = p_collector_id;

    -- Apply the assignment
    UPDATE public.illegal_dumping_mobile
    SET assigned_to = p_collector_id,
        status      = 'assigned',
        updated_at  = NOW()
    WHERE id = p_report_id
    RETURNING jsonb_build_object(
        'id', id,
        'assigned_to', assigned_to,
        'assigned_to_name', v_collector_name,
        'status', status,
        'updated_at', updated_at
    )
    INTO v_result;

    -- Log the change
    INSERT INTO public.illegal_dumping_history_mobile (
        dumping_id,
        status,
        notes,
        updated_by
    )
    VALUES (
        p_report_id,
        'assigned',
        'Assigned to ' || COALESCE(v_collector_name, 'unknown collector'),
        p_assigned_by
    );

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$function$;
