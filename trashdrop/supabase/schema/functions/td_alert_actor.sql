-- Function public.td_alert_actor
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_alert_actor(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_alert_actor()
 RETURNS TABLE(actor_id uuid, actor_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE rule text := nullif(current_setting('app.alert_actor', true), '');
BEGIN
  IF rule IS NOT NULL THEN
    RETURN QUERY SELECT NULL::uuid, rule;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT u.id, coalesce(nullif(btrim(concat_ws(' ', u.raw_user_meta_data ->> 'firstName', u.raw_user_meta_data ->> 'lastName')), ''), u.email)::text
    FROM auth.users u WHERE u.id = auth.uid();
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, 'System'::text;
  END IF;
END $function$;
