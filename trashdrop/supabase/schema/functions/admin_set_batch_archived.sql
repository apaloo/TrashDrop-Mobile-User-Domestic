-- Function public.admin_set_batch_archived
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- admin_set_batch_archived(p_batch_id uuid, p_archived boolean): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.admin_set_batch_archived(p_batch_id uuid, p_archived boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_do('bags.manage') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = 'insufficient_privilege'; END IF;
  UPDATE public.batches
  SET archived = p_archived,
      archived_at = CASE WHEN p_archived THEN now() END,
      archived_by = CASE WHEN p_archived THEN auth.uid() END
  WHERE id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found' USING ERRCODE = 'no_data_found'; END IF;
END $function$;
