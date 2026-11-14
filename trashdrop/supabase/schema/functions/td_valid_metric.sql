-- Function public.td_valid_metric
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_valid_metric(p_calc text, p_params jsonb): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_valid_metric(p_calc text, p_params jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_calc IN ('activity_count', 'activity_avg', 'activity_ratio') THEN
      jsonb_typeof(p_params -> 'activities') = 'array'
      AND jsonb_array_length(p_params -> 'activities') > 0
      AND (SELECT bool_and(a IN ('report.created', 'report.verified', 'cleanup.assigned', 'cleanup.received',
                                 'cleanup.claimed', 'cleanup.released', 'cleanup.claim_expired',
                                 'cleanup.started', 'cleanup.completed', 'cleanup.marked_cleaned'))
           FROM jsonb_array_elements_text(p_params -> 'activities') a)
      AND (p_calc <> 'activity_ratio' OR (
        jsonb_typeof(p_params -> 'of') = 'array' AND jsonb_array_length(p_params -> 'of') > 0
        AND (SELECT bool_and(a IN ('report.created', 'report.verified', 'cleanup.assigned', 'cleanup.received',
                                   'cleanup.claimed', 'cleanup.released', 'cleanup.claim_expired',
                                   'cleanup.started', 'cleanup.completed', 'cleanup.marked_cleaned'))
             FROM jsonb_array_elements_text(p_params -> 'of') a)))
    WHEN p_calc = 'area_reports' THEN p_params ->> 'status' IN ('new', 'cleaned')
    WHEN p_calc = 'area_cleaned_within' THEN
      jsonb_typeof(p_params -> 'days') = 'number' AND (p_params ->> 'days')::numeric BETWEEN 1 AND 30
    WHEN p_calc IN ('area_avg_clean_hours', 'area_open_backlog') THEN true
    ELSE false END
$function$;
