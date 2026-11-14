-- Function public.td_my_team
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_my_team(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_my_team()
 RETURNS TABLE(group_id uuid, team_role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid(), 'owner'::text
  FROM public.account_roles r WHERE r.user_id = auth.uid() AND r.role IN ('volunteer', 'authority')
  UNION ALL
  SELECT tm.group_id, tm.team_role
  FROM public.team_members tm
  WHERE tm.member_id = auth.uid() AND tm.status = 'active' AND tm.group_id = public.td_team_of(auth.uid())
  LIMIT 1
$function$;
