-- Function public.td_write_log
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_write_log(p_level text, p_source text, p_action text, p_entity_type text, p_entity_id text, p_message text, p_before jsonb, p_after jsonb, p_metadata jsonb, p_actor_id uuid, p_actor_name text, p_actor_role text): execute: service_role
CREATE OR REPLACE FUNCTION public.td_write_log(p_level text, p_source text, p_action text, p_entity_type text, p_entity_id text, p_message text, p_before jsonb DEFAULT NULL::jsonb, p_after jsonb DEFAULT NULL::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb, p_actor_id uuid DEFAULT NULL::uuid, p_actor_name text DEFAULT NULL::text, p_actor_role text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a record;
  new_id text;
  ua text;
BEGIN
  SELECT * INTO a FROM public.td_audit_actor() LIMIT 1;
  -- The browser's user agent, from the API request (NULL for cron / SQL editor)
  BEGIN
    ua := left(nullif(current_setting('request.headers', true), '')::json ->> 'user-agent', 400);
  EXCEPTION WHEN OTHERS THEN ua := NULL;
  END;
  INSERT INTO public.logs (level, source, action, entity_type, entity_id, message, before, after, metadata,
                           actor_id, actor_name, actor_role, user_id, user_agent, created_at, is_sample)
  VALUES (p_level, p_source, p_action, p_entity_type, p_entity_id, left(coalesce(p_message, ''), 2000),
          p_before, p_after, coalesce(p_metadata, '{}'::jsonb),
          coalesce(p_actor_id, a.actor_id), coalesce(p_actor_name, a.actor_name), coalesce(p_actor_role, a.actor_role),
          coalesce(p_actor_id, a.actor_id), ua, now(), false)
  RETURNING id::text INTO new_id;
  RETURN new_id;
END $function$;
