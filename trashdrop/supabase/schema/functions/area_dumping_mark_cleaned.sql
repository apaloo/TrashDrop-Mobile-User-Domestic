-- Function public.area_dumping_mark_cleaned
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- area_dumping_mark_cleaned(p_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.area_dumping_mark_cleaned(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.illegal_dumping_mobile := public.td_area_report_for(p_id, 'markCleaned');
BEGIN
  IF lower(coalesce(r.status, '')) <> 'in_progress' THEN
    RAISE EXCEPTION 'Only reports being cleaned up can be marked cleaned (this one is %)', r.status USING ERRCODE = 'P0001';
  END IF;
  PERFORM set_config('app.td_area_action', 'on', true);
  UPDATE public.illegal_dumping_mobile SET status = 'completed', updated_at = now() WHERE id = p_id;
  PERFORM set_config('app.td_area_action', '', true);
  RETURN jsonb_build_object('id', p_id, 'status', 'completed');
END $function$;
