-- Function public.protect_collector_admin_fields
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- protect_collector_admin_fields(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.protect_collector_admin_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.td_is_staff() THEN
    RETURN NEW; -- service role / backend, or TrashDrop staff
  END IF;

  IF (OLD.status = 'suspended') <> (NEW.status = 'suspended')
     OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at
     OR NEW.deactivated_by IS DISTINCT FROM OLD.deactivated_by
     OR NEW.deactivation_reason IS DISTINCT FROM OLD.deactivation_reason
     OR NEW.pending_balance IS DISTINCT FROM OLD.pending_balance
     OR NEW.withdrawable_balance IS DISTINCT FROM OLD.withdrawable_balance
     OR (NEW.rating IS DISTINCT FROM OLD.rating
         AND coalesce(current_setting('td.rating_sync', true), '') <> 'on') THEN
    RAISE EXCEPTION 'These account fields can only be changed by TrashDrop staff'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
