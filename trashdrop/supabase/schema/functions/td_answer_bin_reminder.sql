-- Function public.td_answer_bin_reminder
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_answer_bin_reminder(p_reminder_id uuid, p_action text, p_bin_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_answer_bin_reminder(p_reminder_id uuid, p_action text, p_bin_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_rem public.bin_reminders%rowtype;
begin
  select * into v_rem from public.bin_reminders where id = p_reminder_id for update;
  if not found or v_rem.user_id is distinct from v_uid then
    raise exception 'That reminder was not found' using errcode = 'P0002';
  end if;

  if p_action = 'booked' then
    if p_bin_id is null or not exists (
      select 1 from public.digital_bins where id = p_bin_id and user_id = v_uid
    ) then
      raise exception 'That booking was not found' using errcode = 'P0002';
    end if;
    update public.bin_reminders
       set status = 'booked', booked_bin_id = p_bin_id, responded_at = now()
     where id = v_rem.id;
  elsif p_action = 'skip' then
    update public.bin_reminders set status = 'skipped', responded_at = now()
     where id = v_rem.id and status = 'pending';
  elsif p_action = 'stop' then
    update public.bin_reminders set status = 'skipped', responded_at = now()
     where id = v_rem.id and status = 'pending';
    update public.bin_reminder_plans
       set status = 'stopped', stopped_at = now(), updated_at = now()
     where id = v_rem.plan_id and status = 'active';
  else
    raise exception 'Unknown answer %', p_action using errcode = '22023';
  end if;
end;
$function$;
