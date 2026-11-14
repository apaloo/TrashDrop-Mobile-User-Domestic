-- Function public.team_create_invite
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- team_create_invite(p_team_role text, p_days integer, p_max_uses integer): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.team_create_invite(p_team_role text DEFAULT 'member'::text, p_days integer DEFAULT 7, p_max_uses integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me record;
  inv public.team_invites;
BEGIN
  SELECT * INTO me FROM public.td_my_team();
  IF me.group_id IS NULL OR me.team_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only the group and its admins can invite members' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_team_role, 'member') NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'An invite is for a member or a group admin' USING ERRCODE = '22023';
  END IF;
  IF p_team_role = 'admin' AND me.team_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the group''s own account can invite group admins' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM public.team_invites
      WHERE group_id = me.group_id AND revoked_at IS NULL AND expires_at > now() AND uses < max_uses) >= 20 THEN
    RAISE EXCEPTION 'This group already has 20 open invite links; cancel some first' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.team_invites (group_id, token, team_role, created_by, expires_at, max_uses)
  VALUES (me.group_id,
          replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
          coalesce(p_team_role, 'member'), auth.uid(),
          now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))),
          greatest(1, least(coalesce(p_max_uses, 25), 200)))
  RETURNING * INTO inv;
  RETURN jsonb_build_object('id', inv.id, 'token', inv.token, 'team_role', inv.team_role,
    'expires_at', inv.expires_at, 'max_uses', inv.max_uses);
END $function$;
