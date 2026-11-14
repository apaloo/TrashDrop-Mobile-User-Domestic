-- Function public.td_capability_roles
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_capability_roles(p_capability text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_capability_roles(p_capability text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT CASE p_capability
    WHEN 'dashboard.stats' THEN ARRAY['admin', 'manager']
    WHEN 'dashboard.liveQueue' THEN ARRAY['admin', 'manager']
    WHEN 'requests.view' THEN ARRAY['admin', 'manager']
    WHEN 'requests.assign' THEN ARRAY['admin', 'manager']
    WHEN 'requests.cancel' THEN ARRAY['admin', 'manager']
    WHEN 'requests.locate' THEN ARRAY['admin']
    WHEN 'collectors.view' THEN ARRAY['admin']
    WHEN 'alerts.view' THEN ARRAY['admin']
    WHEN 'logs.view' THEN ARRAY['admin']
    WHEN 'bags.view' THEN ARRAY['admin']
    WHEN 'bags.manage' THEN ARRAY['admin']
    WHEN 'dumping.view' THEN ARRAY['admin', 'manager', 'authority', 'media', 'volunteer', 'user']
    WHEN 'dumping.reporters' THEN ARRAY['admin', 'manager', 'authority']
    WHEN 'dumping.verify' THEN ARRAY['admin', 'manager', 'authority', 'media', 'volunteer']
    WHEN 'dumping.assign' THEN ARRAY['admin', 'manager', 'authority', 'volunteer']
    WHEN 'dumping.fee' THEN ARRAY['admin', 'authority']
    WHEN 'dumping.markCleaned' THEN ARRAY['admin', 'manager', 'authority', 'volunteer']
    WHEN 'dumping.manage' THEN ARRAY['admin', 'manager']
    WHEN 'reports.view' THEN ARRAY['admin', 'manager', 'media', 'authority', 'volunteer']
    WHEN 'reports.export' THEN ARRAY['admin', 'manager', 'media', 'authority', 'volunteer']
    WHEN 'users.manage' THEN ARRAY['admin']
    WHEN 'settings.manage' THEN ARRAY['admin']
    WHEN 'rewards.manage' THEN ARRAY['admin', 'manager']
    WHEN 'payments.confirm' THEN ARRAY['admin']
    ELSE ARRAY[]::text[]
  END
$function$;
