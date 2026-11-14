-- Function public.td_send_bin_reminders
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_send_bin_reminders(): execute: service_role
CREATE OR REPLACE FUNCTION public.td_send_bin_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today    date := public.td_today_accra();
  v_tomorrow date := public.td_today_accra() + 1;
  v_plan     public.bin_reminder_plans%rowtype;
  v_created  integer := 0;
  v_rows     integer;
begin
  -- Reminders nobody answered before their day has passed
  update public.bin_reminders
     set status = 'expired', responded_at = now()
   where status = 'pending' and due_date < v_today;

  for v_plan in
    select * from public.bin_reminder_plans
     where status = 'active' and next_due_date <= v_tomorrow
     for update skip locked
  loop
    -- The job missed a day: move past collections that are already over
    while v_plan.next_due_date < v_tomorrow loop
      v_plan.occurrence := v_plan.occurrence + 1;
      v_plan.next_due_date := public.td_reminder_due_date(v_plan.start_date, v_plan.frequency, v_plan.occurrence);
    end loop;

    if v_plan.next_due_date = v_tomorrow then
      -- No reminder when that collection is already booked at this place
      if not exists (
        select 1 from public.digital_bins b
         where b.user_id = v_plan.user_id
           and b.location_id is not distinct from v_plan.location_id
           and coalesce(b.status, '') <> 'cancelled'
           and (b.details like '%Preferred date: ' || to_char(v_tomorrow, 'YYYY-MM-DD') || '%'
                or b.created_at >= (v_tomorrow - 3)::timestamp at time zone 'Africa/Accra')
      ) then
        insert into public.bin_reminders (plan_id, user_id, due_date)
        values (v_plan.id, v_plan.user_id, v_tomorrow)
        on conflict (plan_id, due_date) do nothing;
        get diagnostics v_rows = row_count;
        v_created := v_created + v_rows;
      end if;

      v_plan.occurrence := v_plan.occurrence + 1;
      v_plan.next_due_date := public.td_reminder_due_date(v_plan.start_date, v_plan.frequency, v_plan.occurrence);
    end if;

    update public.bin_reminder_plans
       set occurrence = v_plan.occurrence, next_due_date = v_plan.next_due_date, updated_at = now()
     where id = v_plan.id;
  end loop;

  return v_created;
end;
$function$;
