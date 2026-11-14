-- Function public.team_revoke_invite
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- team_revoke_invite(p_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.team_revoke_invite(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE me record;
BEGIN
  SELECT * INTO me FROM public.td_my_team();
  IF me.group_id IS NULL OR me.team_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only the group and its admins can cancel invite links' USING ERRCODE = '42501';
  END IF;
  UPDATE public.team_invites SET revoked_at = now()
  WHERE id = p_id AND group_id = me.group_id AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite link not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('id', p_id, 'revoked', true);
END $function$;
