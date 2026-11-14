-- Function public.td_alert_activity_to_logs
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_alert_activity_to_logs(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_alert_activity_to_logs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  al record;
  act text;
  lvl text := 'info';
  role text;
  msg text;
BEGIN
  IF NEW.actor_name IS NULL OR NEW.actor_id IS NULL THEN
    SELECT coalesce(NEW.actor_id, x.actor_id), coalesce(NEW.actor_name, x.actor_name) INTO NEW.actor_id, NEW.actor_name
    FROM public.td_alert_actor() x LIMIT 1;
  END IF;
  SELECT title, severity INTO al FROM public.alerts WHERE id = NEW.alert_id;
  role := CASE WHEN NEW.actor_name LIKE 'Rule:%' THEN 'rule'
               WHEN NEW.actor_id IS NULL THEN 'system'
               ELSE (SELECT actor_role FROM public.td_audit_actor() LIMIT 1) END;
  act := CASE NEW.kind
    WHEN 'created' THEN 'alert.created'
    WHEN 'status' THEN CASE NEW.to_value
      WHEN 'acknowledged' THEN 'alert.acknowledged' WHEN 'in_progress' THEN 'alert.started'
      WHEN 'resolved' THEN CASE WHEN role = 'rule' THEN 'alert.auto_resolved' ELSE 'alert.resolved' END
      WHEN 'closed' THEN 'alert.closed' WHEN 'open' THEN 'alert.reopened' ELSE 'alert.status_changed' END
    WHEN 'assigned' THEN 'alert.assigned'
    WHEN 'escalated' THEN 'alert.escalated'
    WHEN 'comment' THEN 'alert.commented'
    WHEN 'action' THEN 'alert.action'
    ELSE 'alert.updated' END;
  IF NEW.kind = 'created' AND al.severity IN ('critical', 'high') THEN lvl := 'warn'; END IF;
  IF NEW.kind = 'action' AND (NEW.data ->> 'ok') = 'false' THEN lvl := 'error'; END IF;
  msg := format('Alert "%s": %s', left(coalesce(al.title, ''), 80), CASE NEW.kind
    WHEN 'created'   THEN 'created'
    WHEN 'status'    THEN coalesce(NEW.from_value, '?') || ' → ' || NEW.to_value || coalesce(' (' || NEW.note || ')', '')
    WHEN 'assigned'  THEN CASE WHEN NEW.to_value IS NULL THEN 'unassigned' ELSE 'assigned' END
    WHEN 'escalated' THEN 'priority ' || coalesce(NEW.from_value, '?') || ' → ' || NEW.to_value
    WHEN 'comment'   THEN 'comment: ' || left(coalesce(NEW.note, ''), 160)
    WHEN 'action'    THEN coalesce(NEW.to_value, 'action') || coalesce(': ' || NEW.note, '')
    ELSE NEW.kind END);
  BEGIN
    PERFORM public.td_write_log(lvl, 'alerts', act, 'alert', NEW.alert_id::text, msg,
      CASE WHEN NEW.from_value IS NOT NULL THEN jsonb_build_object(CASE NEW.kind WHEN 'escalated' THEN 'priority' WHEN 'assigned' THEN 'assigned_to' ELSE 'status' END, NEW.from_value) END,
      CASE WHEN NEW.kind IN ('status', 'assigned', 'escalated', 'created') THEN
        jsonb_strip_nulls(jsonb_build_object(CASE NEW.kind WHEN 'escalated' THEN 'priority' WHEN 'assigned' THEN 'assigned_to' ELSE 'status' END, NEW.to_value,
                                             'note', CASE WHEN NEW.kind = 'status' THEN NEW.note END)) END,
      jsonb_strip_nulls(NEW.data || jsonb_build_object('title', al.title, 'priority', al.severity,
                                                       'comment', CASE WHEN NEW.kind = 'comment' THEN NEW.note END,
                                                       'action', CASE WHEN NEW.kind = 'action' THEN NEW.to_value END)),
      NEW.actor_id, NEW.actor_name, role);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END $function$;
