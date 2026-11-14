-- Function public.td_create_reminder_plan
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_create_reminder_plan(p_bin_id uuid, p_start_date date, p_preferred_time text, p_notes text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_create_reminder_plan(p_bin_id uuid, p_start_date date, p_preferred_time text DEFAULT 'morning'::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_bin   public.digital_bins%rowtype;
  v_today date := public.td_today_accra();
  v_n     integer := 1;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to set up reminders' using errcode = '42501';
  end if;

  select * into v_bin from public.digital_bins where id = p_bin_id;
  if not found or v_bin.user_id is distinct from v_uid then
    raise exception 'That booking was not found' using errcode = 'P0002';
  end if;
  if v_bin.frequency not in ('weekly', 'biweekly', 'monthly') then
    raise exception 'Reminders are only for weekly, bi-weekly or monthly bookings' using errcode = '22023';
  end if;
  if p_start_date is null or p_start_date < v_today - 1 or p_start_date > v_today + 366 then
    raise exception 'Choose a start date from today onwards' using errcode = '22023';
  end if;

  -- First collection after today
  while public.td_reminder_due_date(p_start_date, v_bin.frequency, v_n) <= v_today loop
    v_n := v_n + 1;
  end loop;

  insert into public.bin_reminder_plans (
    user_id, source_bin_id, location_id, frequency, start_date, occurrence,
    next_due_date, preferred_time, bin_size_liters, waste_type, bag_count, notes
  ) values (
    v_uid, v_bin.id, v_bin.location_id, v_bin.frequency, p_start_date, v_n,
    public.td_reminder_due_date(p_start_date, v_bin.frequency, v_n),
    case when p_preferred_time in ('morning', 'afternoon', 'evening') then p_preferred_time else 'morning' end,
    v_bin.bin_size_liters, v_bin.waste_type, greatest(coalesce(v_bin.bag_count, 1), 1),
    nullif(left(btrim(coalesce(p_notes, '')), 1000), '')
  )
  on conflict (source_bin_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.bin_reminder_plans where source_bin_id = v_bin.id;
  end if;
  return v_id;
end;
$function$;
