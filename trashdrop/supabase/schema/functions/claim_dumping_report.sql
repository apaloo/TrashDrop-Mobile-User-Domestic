-- Function public.claim_dumping_report
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- claim_dumping_report(p_report_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.claim_dumping_report(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile uuid := public.td_my_volunteer_profile();
  v_group text;
  r public.illegal_dumping_mobile;
  open_claims integer;
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Only approved volunteer groups can claim reports' USING ERRCODE = '42501';
  END IF;
  PERFORM public.td_release_expired_claims();

  SELECT * INTO r FROM public.illegal_dumping_mobile WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF r.assigned_to IS NOT NULL OR r.status IN ('in_progress', 'completed', 'disposed') THEN
    RAISE EXCEPTION 'Someone has already taken this report' USING ERRCODE = 'P0001';
  END IF;
  IF r.status <> 'verified' THEN
    RAISE EXCEPTION 'This report can''t be claimed (it is %)', r.status USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.td_in_my_area(r.region, r.district) THEN
    RAISE EXCEPTION 'This report is outside your region' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO open_claims FROM public.illegal_dumping_mobile
  WHERE assigned_to = v_profile AND status IN ('verified', 'in_progress');
  IF open_claims >= 3 THEN
    RAISE EXCEPTION 'Finish one of your 3 open clean-ups before claiming another' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.td_claim', 'on', true);
  UPDATE public.illegal_dumping_mobile SET assigned_to = v_profile, updated_at = now() WHERE id = p_report_id;
  PERFORM set_config('app.td_claim', '', true);

  SELECT coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), 'A volunteer group') INTO v_group
  FROM public.collector_profiles WHERE id = v_profile;
  PERFORM public.td_write_log('info', 'collector', 'dumping.claimed', 'illegal_dumping', p_report_id::text,
    format('%s claimed the cleanup at %s', v_group, coalesce(r.location, 'a reported site')),
    jsonb_build_object('assigned_to', NULL), jsonb_build_object('assigned_to', v_profile),
    jsonb_build_object('district', r.district, 'region', r.region), auth.uid(), v_group, 'volunteer');

  RETURN jsonb_build_object('id', p_report_id, 'assigned_to', v_profile,
    'accept_by', now() + interval '24 hours', 'finish_by', now() + interval '72 hours');
END $function$;
