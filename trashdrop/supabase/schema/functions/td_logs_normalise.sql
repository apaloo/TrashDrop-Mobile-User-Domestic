-- Function public.td_logs_normalise
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_logs_normalise(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_logs_normalise()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  NEW.level := public.td_log_level(NEW.level);
  NEW.created_at := coalesce(NEW.created_at, now());
  NEW.metadata := coalesce(NEW.metadata, NEW.data, '{}'::jsonb);
  NEW.actor_id := coalesce(NEW.actor_id, NEW.user_id);
  NEW.user_id := coalesce(NEW.user_id, NEW.actor_id);
  NEW.message := coalesce(NEW.message, '');
  NEW.is_sample := coalesce(NEW.is_sample, false);
  RETURN NEW;
END $function$;
