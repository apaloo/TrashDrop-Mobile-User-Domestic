-- Function public.release_dumping_claim
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- release_dumping_claim(p_report_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.release_dumping_claim(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile uuid := public.td_my_volunteer_profile();
  r public.illegal_dumping_mobile;
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Only approved volunteer groups can release claims' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.illegal_dumping_mobile WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND OR r.assigned_to IS DISTINCT FROM v_profile OR r.assigned_via IS DISTINCT FROM 'claim' THEN
    RAISE EXCEPTION 'This report is not claimed by your group' USING ERRCODE = '42501';
  END IF;
  IF r.status NOT IN ('verified', 'in_progress') THEN
    RAISE EXCEPTION 'A completed cleanup can''t be given back' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.td_claim', 'on', true);
  PERFORM set_config('app.skip_status_flow', 'on', true);
  UPDATE public.illegal_dumping_mobile SET assigned_to = NULL, status = 'verified', updated_at = now() WHERE id = p_report_id;
  PERFORM set_config('app.td_claim', '', true);
  PERFORM set_config('app.skip_status_flow', '', true);

  PERFORM public.td_write_log('info', 'collector', 'dumping.claim_released', 'illegal_dumping', p_report_id::text,
    'A volunteer group gave a cleanup back', jsonb_build_object('assigned_to', v_profile, 'status', r.status),
    jsonb_build_object('assigned_to', NULL, 'status', 'verified'), '{}'::jsonb, auth.uid(), NULL, 'volunteer');
  RETURN jsonb_build_object('id', p_report_id, 'released', true);
END $function$;
