-- Function public.log_audit
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- log_audit(p_level text, p_source text, p_action text, p_message text, p_entity_type text, p_entity_id text, p_before jsonb, p_after jsonb, p_metadata jsonb): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.log_audit(p_level text, p_source text, p_action text, p_message text, p_entity_type text DEFAULT NULL::text, p_entity_id text DEFAULT NULL::text, p_before jsonb DEFAULT NULL::jsonb, p_after jsonb DEFAULT NULL::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  email text := lower(left(coalesce(p_metadata ->> 'email', ''), 200));
BEGIN
  IF p_action IS NULL OR p_action !~ '^[a-z_]+\.[a-z_]+$' THEN
    RAISE EXCEPTION 'action must look like "request.assigned"';
  END IF;
  IF length(coalesce(p_metadata, '{}'::jsonb)::text) > 8000 OR length(coalesce(p_before, '{}'::jsonb)::text) > 8000
     OR length(coalesce(p_after, '{}'::jsonb)::text) > 8000 THEN
    RAISE EXCEPTION 'log payload too large';
  END IF;
  IF public.td_is_staff() THEN
    RETURN public.td_write_log(p_level, p_source, p_action, p_entity_type, p_entity_id, p_message, p_before, p_after, p_metadata);
  END IF;
  IF p_action IN ('auth.login', 'auth.logout') AND auth.uid() IS NOT NULL THEN
    RETURN public.td_write_log(p_level, 'auth', p_action, 'user', auth.uid()::text, p_message, NULL, NULL,
                               jsonb_build_object('email', email, 'admin_access', false));
  END IF;
  IF p_action = 'auth.login_failed' THEN
    IF (SELECT count(*) FROM public.logs WHERE action = 'auth.login_failed' AND created_at > now() - interval '10 minutes'
          AND metadata ->> 'email' = email) >= 10
       OR (SELECT count(*) FROM public.logs WHERE action = 'auth.login_failed' AND created_at > now() - interval '1 minute') >= 60 THEN
      RETURN NULL; -- rate limited: drop silently
    END IF;
    RETURN public.td_write_log('warn', 'auth', 'auth.login_failed', 'user', NULL, left(coalesce(p_message, 'Sign-in failed'), 300),
                               NULL, NULL, jsonb_build_object('email', email, 'reason', left(coalesce(p_metadata ->> 'reason', ''), 300)),
                               NULL, coalesce(nullif(email, ''), 'Unknown'), 'anonymous');
  END IF;
  RAISE EXCEPTION 'Not allowed' USING ERRCODE = 'insufficient_privilege';
END $function$;
