-- Function public.td_archive_old_logs
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_archive_old_logs(p_months integer): execute: service_role
CREATE OR REPLACE FUNCTION public.td_archive_old_logs(p_months integer DEFAULT 12)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE moved integer;
BEGIN
  WITH old AS (
    DELETE FROM public.logs WHERE created_at < now() - make_interval(months => p_months) RETURNING *
  )
  INSERT INTO public.logs_archive SELECT old.*, now() FROM old;
  GET DIAGNOSTICS moved = ROW_COUNT;
  IF moved > 0 THEN
    PERFORM public.td_write_log('info', 'system', 'logs.archived', NULL, NULL,
                                format('%s log rows older than %s months moved to logs_archive', moved, p_months));
  END IF;
  RETURN moved;
END $function$;
