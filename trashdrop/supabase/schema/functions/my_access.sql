-- Function public.my_access
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- my_access(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.my_access()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  r public.account_roles;
  g public.account_roles;
  t record;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('role', 'user', 'status', 'approved'); END IF;
  SELECT * INTO r FROM public.account_roles WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    INSERT INTO public.account_roles (user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING RETURNING * INTO r;
    IF r.user_id IS NULL THEN SELECT * INTO r FROM public.account_roles WHERE user_id = auth.uid(); END IF;
  END IF;
  SELECT * INTO g FROM public.account_roles WHERE user_id = public.td_effective_account(auth.uid());
  SELECT * INTO t FROM public.td_my_team();
  RETURN jsonb_build_object(
    'role', public.td_my_role(),
    'requested_role', CASE WHEN public.td_is_staff() THEN 'admin' ELSE r.requested_role END,
    'status', CASE WHEN public.td_is_staff() THEN 'approved' ELSE r.status END,
    'company_type', g.company_type, 'org_name', g.org_name, 'region', g.region, 'district', g.district,
    'review_note', r.review_note,
    'team', CASE WHEN t.group_id IS NULL THEN NULL ELSE jsonb_build_object(
      'group_id', t.group_id, 'group_name', g.org_name, 'team_role', t.team_role) END);
END $function$;
