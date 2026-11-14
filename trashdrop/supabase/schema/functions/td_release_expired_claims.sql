-- Function public.td_release_expired_claims
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_release_expired_claims(): execute: service_role
CREATE OR REPLACE FUNCTION public.td_release_expired_claims()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  n integer;
BEGIN
  PERFORM set_config('app.td_claim', 'on', true);
  PERFORM set_config('app.skip_status_flow', 'on', true); -- in_progress → verified is not a normal step
  UPDATE public.illegal_dumping_mobile
  SET assigned_to = NULL, status = 'verified', updated_at = now()
  WHERE assigned_via = 'claim'
    AND ((status = 'verified' AND assigned_at < now() - interval '24 hours')
      OR (status = 'in_progress' AND assigned_at < now() - interval '72 hours'));
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.td_claim', '', true);
  PERFORM set_config('app.skip_status_flow', '', true);
  IF n > 0 THEN
    PERFORM public.td_write_log('info', 'system', 'dumping.claim_expired', 'illegal_dumping', NULL,
      format('%s volunteer claim(s) expired and went back to the pool', n), NULL, NULL,
      jsonb_build_object('count', n), NULL, 'System', 'system');
  END IF;
  RETURN n;
END $function$;
