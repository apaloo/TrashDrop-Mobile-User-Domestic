-- Function public.update_illegal_dumping_status
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- update_illegal_dumping_status(p_report_id uuid, p_new_status text, p_updated_by uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.update_illegal_dumping_status(p_report_id uuid, p_new_status text, p_updated_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_old_status text;
    v_assigned_to uuid;
    v_result jsonb;
BEGIN
    SELECT status, assigned_to
      INTO v_old_status, v_assigned_to
    FROM public.illegal_dumping_mobile
    WHERE id = p_report_id
    FOR UPDATE;

    UPDATE public.illegal_dumping_mobile
    SET status = p_new_status,
        updated_at = NOW(),
        assigned_to = CASE
            WHEN p_new_status = 'assigned' AND v_assigned_to IS NULL
              THEN p_updated_by
            ELSE v_assigned_to
        END
    WHERE id = p_report_id
    RETURNING jsonb_build_object(
        'id', id,
        'status', status,
        'assigned_to', assigned_to,
        'updated_at', updated_at
    )
    INTO v_result;

    INSERT INTO public.illegal_dumping_history_mobile (
        dumping_id,
        status,
        notes,
        updated_by
    )
    VALUES (
        p_report_id,
        p_new_status,
        'Status changed from ' || COALESCE(v_old_status, 'NULL') || ' to ' || p_new_status,
        p_updated_by
    );

    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$function$;

-- update_illegal_dumping_status(p_report_id uuid, p_status text, p_notes text): execute: service_role
CREATE OR REPLACE FUNCTION public.update_illegal_dumping_status(p_report_id uuid, p_status text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  updated_count int;
  updated_report jsonb;
BEGIN
  UPDATE public.illegal_dumping_mobile
  SET status = p_status,
      updated_at = now()
  WHERE id = p_report_id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  updated_report := jsonb_build_object(
    'success', updated_count > 0,
    'message', CASE WHEN updated_count > 0 THEN 'Status updated successfully' ELSE 'Report not found' END,
    'report_id', p_report_id,
    'new_status', p_status
  );

  RETURN updated_report;
END;
$function$;
