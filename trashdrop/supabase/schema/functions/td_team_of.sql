-- Function public.td_team_of
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_team_of(p_user uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.td_team_of(p_user uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tm.group_id
  FROM public.team_members tm
  JOIN public.account_roles g ON g.user_id = tm.group_id AND g.role IN ('volunteer', 'authority')
  WHERE tm.member_id = p_user AND tm.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM public.account_roles me WHERE me.user_id = p_user AND me.role <> 'user')
  LIMIT 1
$function$;
