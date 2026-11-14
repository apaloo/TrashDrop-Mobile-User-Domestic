-- Function public.td_batches_fill_details
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_batches_fill_details(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_batches_fill_details()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE j jsonb := to_jsonb(NEW);
BEGIN
  NEW.type := coalesce(nullif(btrim(NEW.type), ''), public.td_batch_type_from_text(j ->> 'notes', j ->> 'batch_name'));
  NEW.size := coalesce(nullif(btrim(NEW.size), ''), public.td_batch_size_from_text(j ->> 'notes', j ->> 'batch_name'));
  NEW.qr_prefix := coalesce(nullif(btrim(NEW.qr_prefix), ''), public.td_bag_qr_prefix(NEW.type, NEW.size));
  IF NEW.generated_by IS NULL AND public.td_is_staff() THEN
    BEGIN NEW.generated_by := auth.uid(); EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  NEW.archived := coalesce(NEW.archived, false);
  RETURN NEW;
END $function$;
