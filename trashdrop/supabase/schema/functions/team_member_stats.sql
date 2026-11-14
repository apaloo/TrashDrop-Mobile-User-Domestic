-- Function public.team_member_stats
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- team_member_stats(p_days integer): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.team_member_stats(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  me record;
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
BEGIN
  SELECT * INTO me FROM public.td_my_team();
  IF me.group_id IS NULL THEN
    RAISE EXCEPTION 'You are not in a volunteer group' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(x ORDER BY (x ->> 'is_group')::boolean DESC, (x ->> 'total')::int DESC, x ->> 'name')
    FROM (
      SELECT jsonb_build_object(
        'member_id', p.id, 'is_group', p.id = me.group_id,
        'name', CASE WHEN p.id = me.group_id THEN 'Group account' ELSE public.td_user_name(p.id) END,
        'verified', count(*) FILTER (WHERE a.activity = 'report.verified'),
        'assigned', count(*) FILTER (WHERE a.activity = 'cleanup.assigned'),
        'claimed', count(*) FILTER (WHERE a.activity = 'cleanup.claimed'),
        'completed', count(*) FILTER (WHERE a.activity = 'cleanup.completed'),
        'marked_cleaned', count(*) FILTER (WHERE a.activity = 'cleanup.marked_cleaned'),
        'total', count(a.id)) AS x
      FROM (
        SELECT me.group_id AS id
        UNION
        SELECT tm.member_id FROM public.team_members tm WHERE tm.group_id = me.group_id AND tm.status = 'active'
      ) p
      LEFT JOIN public.account_activity a
        ON a.account_id = p.id AND a.occurred_at >= since
       AND (p.id = me.group_id OR a.team_id = me.group_id)
      GROUP BY p.id
    ) s), '[]'::jsonb);
END $function$;
