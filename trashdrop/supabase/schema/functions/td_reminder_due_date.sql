-- Function public.td_reminder_due_date
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_reminder_due_date(p_start date, p_frequency text, p_n integer): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_reminder_due_date(p_start date, p_frequency text, p_n integer)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_frequency
    when 'weekly'   then p_start + 7 * p_n
    when 'biweekly' then p_start + 14 * p_n
    when 'monthly'  then (p_start + make_interval(months => p_n))::date
  end;
$function$;
