-- Function public.td_stamp_assignment
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_stamp_assignment(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_stamp_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare current_status text;
begin
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;
  if new.assigned_to is null then
    new.assigned_at := null;
    new.assigned_via := null;
    new.fee_paid_by := null;
  else
    current_status := lower(trim(coalesce(case when tg_op = 'UPDATE' then old.status else new.status end, 'pending')));
    if current_status = 'pending' then
      raise exception 'Verify this report before assigning a cleanup team' using errcode = 'P0001',
        hint = 'Set status to verified first, then assign the team in a separate step.';
    elsif current_status not in ('verified', 'in_progress') then
      raise exception 'Only verified reports can be assigned a cleanup team (this one is %)', current_status using errcode = 'P0001';
    end if;
    new.assigned_at := now();
    new.assigned_via := case when coalesce(current_setting('app.td_claim', true), '') = 'on' then 'claim' else 'admin' end;
    -- An MMDA (or its team) pays the cleanups it assigns; TrashDrop pays the rest
    new.fee_paid_by := case when auth.uid() is not null and public.td_my_role() = 'authority' then 'mmda' else 'trashdrop' end;
  end if;
  return new;
end $function$;
