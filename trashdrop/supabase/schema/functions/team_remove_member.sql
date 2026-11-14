-- Function public.team_remove_member
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- team_remove_member(p_member uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.team_remove_member(p_member uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me record;
  target public.team_members;
BEGIN
  SELECT * INTO me FROM public.td_my_team();
  IF me.group_id IS NULL OR me.team_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only the group and its admins can remove members' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target FROM public.team_members
  WHERE group_id = me.group_id AND member_id = p_member AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0002'; END IF;
  IF target.team_role = 'admin' AND me.team_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the group''s own account can remove a group admin' USING ERRCODE = '42501';
  END IF;
  UPDATE public.team_members SET status = 'removed', ended_at = now(), ended_by = auth.uid()
  WHERE group_id = me.group_id AND member_id = p_member;
  PERFORM public.td_write_log('info', 'admin', 'team.member_removed', 'user', p_member::text,
    format('%s was removed from the group', coalesce(public.td_user_name(p_member), p_member::text)),
    jsonb_build_object('group_id', me.group_id, 'team_role', target.team_role), NULL,
    '{}'::jsonb, auth.uid(), auth.jwt() ->> 'email', 'volunteer');
  RETURN jsonb_build_object('member_id', p_member, 'removed', true);
END $function$;
