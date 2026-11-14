-- Function public.td_audit_collector
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_audit_collector(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_audit_collector()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tracked text[] := ARRAY['first_name', 'last_name', 'email', 'phone', 'status', 'assigned_region', 'vehicle_type',
                          'license_plate', 'vehicle_plate', 'vehicle_capacity_bags', 'notes', 'deactivation_reason', 'user_id'];
  o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  n jsonb := to_jsonb(NEW);
  b jsonb := '{}'::jsonb;
  a jsonb := '{}'::jsonb;
  k text;
  act text;
  lvl text := 'info';
  nm text := coalesce(nullif(btrim(concat_ws(' ', n ->> 'first_name', n ->> 'last_name')), ''), left(NEW.id::text, 8));
  msg text;
BEGIN
  FOREACH k IN ARRAY tracked LOOP
    IF (o -> k) IS DISTINCT FROM (n -> k) AND (TG_OP = 'UPDATE' OR n ->> k IS NOT NULL) THEN
      IF TG_OP = 'UPDATE' THEN b := b || jsonb_build_object(k, o -> k); END IF;
      a := a || jsonb_build_object(k, n -> k);
    END IF;
  END LOOP;
  IF TG_OP = 'UPDATE' AND a = '{}'::jsonb THEN
    RETURN NEW; -- location / online / timestamps only: not an audit event
  END IF;
  IF TG_OP = 'INSERT' THEN
    act := 'collector.created'; msg := format('Collector %s added', nm);
  ELSIF a ? 'status' AND lower(n ->> 'status') = 'active' THEN
    act := 'collector.reactivated'; msg := format('Collector %s reactivated', nm);
  ELSIF a ? 'status' AND lower(n ->> 'status') IN ('inactive', 'suspended') THEN
    act := 'collector.deactivated'; lvl := 'warn';
    msg := format('Collector %s deactivated%s', nm, coalesce(': ' || (n ->> 'deactivation_reason'), ''));
  ELSIF a ? 'status' THEN
    act := 'collector.status_changed'; msg := format('Collector %s status → %s', nm, n ->> 'status');
  ELSE
    act := 'collector.updated';
    msg := format('Collector %s edited (%s)', nm, (SELECT string_agg(x, ', ') FROM jsonb_object_keys(a) x));
  END IF;
  BEGIN
    PERFORM public.td_write_log(lvl, 'collectors', act, 'collector', NEW.id::text, msg,
                                CASE WHEN TG_OP = 'UPDATE' THEN b END, a, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END $function$;
