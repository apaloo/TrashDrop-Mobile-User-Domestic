-- Function public.team_set_role
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- team_set_role(p_member uuid, p_team_role text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.team_set_role(p_member uuid, p_team_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE me record;
BEGIN
  SELECT * INTO me FROM public.td_my_team();
  IF me.group_id IS NULL OR me.team_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the group''s own account can change member roles' USING ERRCODE = '42501';
  END IF;
  IF p_team_role NOT IN ('member', 'admin') THEN RAISE EXCEPTION 'A member or a group admin' USING ERRCODE = '22023'; END IF;
  UPDATE public.team_members SET team_role = p_team_role
  WHERE group_id = me.group_id AND member_id = p_member AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('member_id', p_member, 'team_role', p_team_role);
END $function$;
