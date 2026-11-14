-- Function public.team_members
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- team_members(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.team_members()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE me record;
BEGIN
  SELECT * INTO me FROM public.td_my_team();
  IF me.group_id IS NULL THEN RAISE EXCEPTION 'You are not in a volunteer group' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'group_id', me.group_id, 'my_role', me.team_role,
    'group_name', (SELECT org_name FROM public.account_roles WHERE user_id = me.group_id),
    'members', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'member_id', tm.member_id, 'name', public.td_user_name(tm.member_id), 'team_role', tm.team_role,
        'joined_at', tm.joined_at, 'is_me', tm.member_id = auth.uid(),
        'email', CASE WHEN me.team_role IN ('owner', 'admin') THEN (SELECT email FROM auth.users WHERE id = tm.member_id) END)
        ORDER BY tm.team_role DESC, tm.joined_at)
      FROM public.team_members tm WHERE tm.group_id = me.group_id AND tm.status = 'active'), '[]'::jsonb));
END $function$;
