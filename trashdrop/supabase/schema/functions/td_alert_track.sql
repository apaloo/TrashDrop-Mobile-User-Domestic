-- Function public.td_alert_track
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_alert_track(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_alert_track()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE a record;
BEGIN
  SELECT * INTO a FROM public.td_alert_actor() LIMIT 1;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.alert_activity (alert_id, kind, to_value, note, data, actor_id, actor_name)
    VALUES (NEW.id, 'created', NEW.status, NEW.title,
            jsonb_build_object('priority', NEW.severity, 'type', NEW.type, 'rule', NEW.rule_key),
            coalesce(a.actor_id, NEW.created_by), a.actor_name);
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.alert_activity (alert_id, kind, from_value, to_value, note, actor_id, actor_name)
    VALUES (NEW.id, 'status', OLD.status, NEW.status,
            CASE WHEN NEW.status IN ('resolved', 'closed') THEN NEW.resolution_note END, a.actor_id, a.actor_name);
  END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.alert_activity (alert_id, kind, from_value, to_value, actor_id, actor_name)
    VALUES (NEW.id, 'assigned', OLD.assigned_to::text, NEW.assigned_to::text, a.actor_id, a.actor_name);
  END IF;
  IF NEW.severity IS DISTINCT FROM OLD.severity THEN
    INSERT INTO public.alert_activity (alert_id, kind, from_value, to_value, actor_id, actor_name)
    VALUES (NEW.id, 'escalated', OLD.severity, NEW.severity, a.actor_id, a.actor_name);
  END IF;
  RETURN NEW;
END $function$;
