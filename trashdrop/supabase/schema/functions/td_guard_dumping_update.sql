-- Function public.td_guard_dumping_update
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_guard_dumping_update(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_guard_dumping_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  changed text[];
  allowed text[];
  bad text[];
BEGIN
  IF auth.uid() IS NULL OR public.td_can_manage_requests()
     OR coalesce(current_setting('app.td_claim', true), '') = 'on'
     OR coalesce(current_setting('app.td_area_action', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  changed := public.td_changed_columns(to_jsonb(OLD), to_jsonb(NEW));
  IF OLD.assigned_to IS NOT NULL AND OLD.assigned_to IN (SELECT public.td_my_collector_profile_ids()) THEN
    allowed := ARRAY['status', 'disposed_at', 'disposal_site_id', 'disposal_site_name', 'completed_at',
                     'cleanup_completed_date', 'notes', 'photos', 'cleanup_photos'];
  ELSIF OLD.reported_by = auth.uid() THEN
    allowed := ARRAY['status', 'description', 'photos'];
  ELSE
    allowed := '{}';
  END IF;
  bad := ARRAY(SELECT c FROM unnest(changed) c
               WHERE c <> ALL (allowed || ARRAY['updated_at', 'region', 'district']));
  IF cardinality(bad) > 0 THEN
    RAISE EXCEPTION 'Not allowed to change % on this report', array_to_string(bad, ', ')
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;
