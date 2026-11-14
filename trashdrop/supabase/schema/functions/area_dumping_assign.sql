-- Function public.area_dumping_assign
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- area_dumping_assign(p_id uuid, p_team uuid, p_fee numeric): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.area_dumping_assign(p_id uuid, p_team uuid, p_fee numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.illegal_dumping_mobile := public.td_area_report_for(p_id, 'assign');
  team record;
  fee numeric := NULL;
BEGIN
  IF lower(coalesce(r.status, 'pending')) <> 'verified' OR r.assigned_to IS NOT NULL THEN
    RAISE EXCEPTION 'Only verified reports with no cleanup team can be assigned' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO team FROM public.area_assignable_teams() t WHERE t.id = p_team;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose an active team in your region' USING ERRCODE = '42501';
  END IF;
  -- Fees only for paid collectors, and only from accounts that may set them
  IF p_fee IS NOT NULL AND p_fee > 0 AND team.collector_type <> 'volunteer' AND public.can_do('dumping.fee') THEN
    fee := round(p_fee, 2);
  END IF;
  PERFORM set_config('app.td_area_action', 'on', true);
  EXECUTE 'UPDATE public.illegal_dumping_mobile SET assigned_to = $1, updated_at = now()'
       || CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                              AND table_name = 'illegal_dumping_mobile' AND column_name = 'cleanup_fee')
               THEN ', cleanup_fee = $2' ELSE '' END
       || ' WHERE id = $3'
    USING p_team, fee, p_id;
  PERFORM set_config('app.td_area_action', '', true);
  RETURN jsonb_build_object('id', p_id, 'assigned_to', p_team, 'team_name', team.name, 'cleanup_fee', fee);
END $function$;
