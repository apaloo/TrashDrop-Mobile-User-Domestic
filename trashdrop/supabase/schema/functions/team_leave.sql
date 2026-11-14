-- Function public.team_leave
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- team_leave(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.team_leave()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE g uuid;
BEGIN
  UPDATE public.team_members SET status = 'left', ended_at = now(), ended_by = auth.uid()
  WHERE member_id = auth.uid() AND status = 'active'
  RETURNING group_id INTO g;
  IF g IS NULL THEN RAISE EXCEPTION 'You are not in a volunteer group' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.td_write_log('info', 'admin', 'team.member_left', 'user', auth.uid()::text,
    format('%s left the group', coalesce(public.td_user_name(auth.uid()), auth.uid()::text)),
    jsonb_build_object('group_id', g), NULL, '{}'::jsonb, auth.uid(), auth.jwt() ->> 'email', 'user');
  RETURN jsonb_build_object('left', true);
END $function$;
