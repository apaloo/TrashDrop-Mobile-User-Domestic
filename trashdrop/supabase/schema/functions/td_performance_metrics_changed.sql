-- Function public.td_performance_metrics_changed
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_performance_metrics_changed(): execute: service_role
CREATE OR REPLACE FUNCTION public.td_performance_metrics_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.performance_refresh SET refreshed_at = NULL;
  RETURN NULL;
END $function$;
