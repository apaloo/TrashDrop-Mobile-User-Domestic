-- Function public.team_accept_invite
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- team_accept_invite(p_token text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.team_accept_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  i public.team_invites;
  g public.account_roles;
  my_role text;
  current_group uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to join a team' USING ERRCODE = '42501'; END IF;
  IF public.td_is_staff() THEN RAISE EXCEPTION 'TrashDrop admin accounts can''t join a team' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO i FROM public.team_invites WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invite link doesn''t exist' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO g FROM public.account_roles WHERE user_id = i.group_id;
  IF i.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'This invite link was cancelled. Ask the group for a new one.' USING ERRCODE = 'P0001'; END IF;
  IF i.expires_at <= now() THEN RAISE EXCEPTION 'This invite link has expired. Ask the group for a new one.' USING ERRCODE = 'P0001'; END IF;
  IF i.uses >= i.max_uses THEN RAISE EXCEPTION 'This invite link has been used up. Ask the group for a new one.' USING ERRCODE = 'P0001'; END IF;
  IF g.role IS NULL OR g.role NOT IN ('volunteer', 'authority') THEN
    RAISE EXCEPTION 'This group isn''t approved on TrashDrop at the moment' USING ERRCODE = 'P0001';
  END IF;
  IF i.group_id = auth.uid() THEN RAISE EXCEPTION 'This is your own team' USING ERRCODE = 'P0001'; END IF;

  SELECT coalesce((SELECT r.role FROM public.account_roles r WHERE r.user_id = auth.uid()), 'user') INTO my_role;
  IF my_role <> 'user' THEN
    RAISE EXCEPTION 'Your account is approved as %, so it can''t join a team. Use a personal account.', my_role USING ERRCODE = 'P0001';
  END IF;
  SELECT tm.group_id INTO current_group FROM public.team_members tm WHERE tm.member_id = auth.uid() AND tm.status = 'active';
  IF current_group = i.group_id THEN
    RETURN jsonb_build_object('group_id', i.group_id, 'group_name', g.org_name, 'already_member', true);
  END IF;
  IF current_group IS NOT NULL THEN
    RAISE EXCEPTION 'You are already in another team. Leave it first.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.team_members (group_id, member_id, team_role, status, invite_id, joined_at)
  VALUES (i.group_id, auth.uid(), i.team_role, 'active', i.id, now())
  ON CONFLICT (group_id, member_id) DO UPDATE
    SET team_role = EXCLUDED.team_role, status = 'active', invite_id = EXCLUDED.invite_id,
        joined_at = now(), ended_at = NULL, ended_by = NULL;
  UPDATE public.team_invites SET uses = uses + 1 WHERE id = i.id;

  PERFORM public.td_write_log('info', 'admin', 'team.member_joined', 'user', auth.uid()::text,
    format('%s joined %s as %s', coalesce(auth.jwt() ->> 'email', auth.uid()::text),
           coalesce(g.org_name, CASE WHEN g.role = 'authority' THEN 'an assembly' ELSE 'a volunteer group' END), i.team_role),
    NULL, jsonb_build_object('group_id', i.group_id, 'group_type', g.role, 'team_role', i.team_role),
    jsonb_build_object('invite_id', i.id), auth.uid(), auth.jwt() ->> 'email', 'user');
  RETURN jsonb_build_object('group_id', i.group_id, 'group_name', g.org_name, 'team_role', i.team_role, 'already_member', false);
END $function$;
