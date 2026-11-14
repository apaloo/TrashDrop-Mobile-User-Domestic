-- Function public.td_audit_batch
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_audit_batch(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_audit_batch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  label text := coalesce(nullif(to_jsonb(NEW) ->> 'batch_number', ''), left(NEW.id::text, 8));
  was_active boolean;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.td_write_log('info', 'bags', 'batch.created', 'batch', NEW.id::text,
        format('Batch %s generated: %s bags%s', label, coalesce(NEW.bag_count, 0),
               coalesce(' (' || concat_ws(' · ', NEW.type, NEW.size) || ')', '')),
        NULL, jsonb_strip_nulls(jsonb_build_object('bag_count', NEW.bag_count, 'type', NEW.type, 'size', NEW.size, 'qr_prefix', NEW.qr_prefix)));
      RETURN NEW;
    END IF;
    was_active := lower(coalesce(OLD.status, '')) = 'active';
    IF was_active AND lower(coalesce(NEW.status, '')) IN ('used', 'activated', 'scanned') THEN
      PERFORM public.td_write_log('info', 'bags', 'batch.distributed', 'batch', NEW.id::text,
        format('Batch %s scanned by a household (%s bags)', label, coalesce(NEW.bag_count, 0)),
        jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status),
        jsonb_build_object('household_id', NEW.created_by));
    END IF;
    IF coalesce(OLD.archived, false) IS DISTINCT FROM coalesce(NEW.archived, false) THEN
      PERFORM public.td_write_log('info', 'bags', CASE WHEN NEW.archived THEN 'batch.archived' ELSE 'batch.restored' END,
        'batch', NEW.id::text, format('Batch %s %s', label, CASE WHEN NEW.archived THEN 'archived' ELSE 'restored' END),
        jsonb_build_object('archived', coalesce(OLD.archived, false)), jsonb_build_object('archived', NEW.archived));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- logging never blocks the change
  END;
  RETURN NEW;
END $function$;
