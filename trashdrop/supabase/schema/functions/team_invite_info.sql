-- Function public.team_invite_info
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- team_invite_info(p_token text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.team_invite_info(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  i public.team_invites;
  g public.account_roles;
BEGIN
  SELECT * INTO i FROM public.team_invites WHERE token = p_token;
  IF NOT FOUND OR p_token IS NULL OR length(p_token) <> 64 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;
  SELECT * INTO g FROM public.account_roles WHERE user_id = i.group_id;
  RETURN jsonb_build_object(
    'group_name', coalesce(g.org_name, CASE WHEN g.role = 'authority' THEN 'An assembly' ELSE 'A volunteer group' END),
    'group_type', g.role,
    'region', g.region,
    'district', CASE WHEN g.role = 'authority' THEN g.district END,
    'team_role', i.team_role,
    'valid', i.revoked_at IS NULL AND i.expires_at > now() AND i.uses < i.max_uses AND g.role IN ('volunteer', 'authority'),
    'reason', CASE WHEN i.revoked_at IS NOT NULL THEN 'revoked'
                   WHEN i.expires_at <= now() THEN 'expired'
                   WHEN i.uses >= i.max_uses THEN 'used_up'
                   WHEN g.role IS NULL OR g.role NOT IN ('volunteer', 'authority') THEN 'group_inactive' END);
END $function$;
