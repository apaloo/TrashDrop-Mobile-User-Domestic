-- Function public.team_invites
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- team_invites(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.team_invites()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE me record;
BEGIN
  SELECT * INTO me FROM public.td_my_team();
  IF me.group_id IS NULL OR me.team_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only the group and its admins can see invite links' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', i.id, 'token', i.token, 'team_role', i.team_role, 'created_at', i.created_at,
      'expires_at', i.expires_at, 'uses', i.uses, 'max_uses', i.max_uses,
      'open', i.revoked_at IS NULL AND i.expires_at > now() AND i.uses < i.max_uses) ORDER BY i.created_at DESC)
    FROM public.team_invites i WHERE i.group_id = me.group_id
      AND (i.revoked_at IS NULL AND i.expires_at > now() - interval '30 days')), '[]'::jsonb);
END $function$;
