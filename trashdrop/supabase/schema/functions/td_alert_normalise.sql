-- Function public.td_alert_normalise
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_alert_normalise(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_alert_normalise()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE s text; p text; t text;
BEGIN
  s := regexp_replace(lower(btrim(coalesce(NEW.status, 'open'))), '[\s-]+', '_', 'g');
  NEW.status := CASE
    WHEN s IN ('open', 'new', 'active', 'triggered') THEN 'open'
    WHEN s IN ('acknowledged', 'ack', 'seen') THEN 'acknowledged'
    WHEN s IN ('in_progress', 'investigating', 'working') THEN 'in_progress'
    WHEN s IN ('resolved', 'auto_resolved', 'fixed', 'done') THEN 'resolved'
    WHEN s IN ('closed', 'dismissed', 'archived', 'ignored') THEN 'closed'
    ELSE 'open' END;
  p := lower(btrim(coalesce(NEW.severity, 'medium')));
  NEW.severity := CASE
    WHEN p IN ('critical', 'urgent', 'emergency', 'p1') THEN 'critical'
    WHEN p IN ('high', 'error', 'p2') THEN 'high'
    WHEN p IN ('low', 'info', 'minor', 'p4') THEN 'low'
    ELSE 'medium' END;
  t := regexp_replace(lower(btrim(coalesce(NEW.type, 'system'))), '[\s-]+', '_', 'g');
  NEW.type := CASE
    WHEN t IN ('', 'info', 'warning', 'error', 'success', 'general') THEN 'system'
    ELSE t END;
  NEW.entity_type := CASE lower(coalesce(NEW.entity_type, ''))
    WHEN '' THEN CASE WHEN NEW.entity_ref IS NULL THEN 'system' ELSE 'pickup_request' END
    WHEN 'request' THEN 'pickup_request'
    WHEN 'pickup' THEN 'pickup_request'
    ELSE lower(NEW.entity_type) END;
  IF NEW.entity_ref IS NULL AND NEW.entity_id IS NOT NULL THEN NEW.entity_ref := NEW.entity_id::text; END IF;
  -- timestamps for each step
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'acknowledged' AND NEW.acknowledged_at IS NULL THEN NEW.acknowledged_at := now(); END IF;
    IF NEW.status = 'resolved' THEN NEW.resolved_at := coalesce(NEW.resolved_at, now()); END IF;
    IF NEW.status = 'closed' THEN NEW.closed_at := coalesce(NEW.closed_at, now()); END IF;
    IF NEW.status IN ('open', 'acknowledged', 'in_progress') THEN
      NEW.resolved_at := NULL; NEW.closed_at := NULL;
      IF TG_OP = 'UPDATE' THEN NEW.auto_resolved := false; END IF;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;
