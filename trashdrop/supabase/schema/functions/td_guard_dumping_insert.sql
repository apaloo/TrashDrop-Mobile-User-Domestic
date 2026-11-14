-- Function public.td_guard_dumping_insert
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_guard_dumping_insert(): execute: service_role
CREATE OR REPLACE FUNCTION public.td_guard_dumping_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or public.td_can_manage_requests() then
    return new; -- service key or staff
  end if;
  new.status := 'pending';
  new.assigned_to := null;
  new.assigned_at := null;
  new.assigned_via := null;
  new.cleanup_fee := null;
  new.completed_at := null;
  new.disposed_at := null;
  new.disposal_site_id := null;
  new.disposal_site_name := null;
  new.cleanup_photos := null;
  return new;
end $function$;
