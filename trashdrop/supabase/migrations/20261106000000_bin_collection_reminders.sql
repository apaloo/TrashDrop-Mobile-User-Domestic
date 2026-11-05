-- Repeat digital bin collections as reminders.
--
-- Weekly, bi-weekly and monthly no longer pretend to book collections on
-- their own. Booking one saves a reminder plan; the day before each
-- following collection the household gets a pop-up in the app and books it
-- like any other request (normal price, promotion rules and QR code).
--
--   bin_reminder_plans  one per repeat booking: when, where and what
--   bin_reminders       one per plan per collection date, with the answer
--
-- Users read their own rows. Every change goes through the functions below.
-- A daily job (07:00 Ghana time) creates the reminders.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.bin_reminder_plans (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  source_bin_id    uuid unique references public.digital_bins(id) on delete set null,
  location_id      uuid references public.bin_locations(id) on delete set null,
  frequency        text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  start_date       date not null,
  -- Collection number the plan is waiting on: 1 is the first after start_date
  occurrence       integer not null default 1 check (occurrence >= 1),
  next_due_date    date not null,
  preferred_time   text not null default 'morning' check (preferred_time in ('morning', 'afternoon', 'evening')),
  bin_size_liters  integer,
  waste_type       text,
  bag_count        integer not null default 1 check (bag_count >= 1),
  notes            text,
  status           text not null default 'active' check (status in ('active', 'stopped')),
  stopped_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists bin_reminder_plans_due_idx
  on public.bin_reminder_plans (next_due_date) where status = 'active';
create index if not exists bin_reminder_plans_user_idx
  on public.bin_reminder_plans (user_id);

create table if not exists public.bin_reminders (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.bin_reminder_plans(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  due_date      date not null,
  status        text not null default 'pending' check (status in ('pending', 'booked', 'skipped', 'expired')),
  booked_bin_id uuid references public.digital_bins(id) on delete set null,
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  unique (plan_id, due_date)
);

create index if not exists bin_reminders_user_pending_idx
  on public.bin_reminders (user_id, due_date) where status = 'pending';

alter table public.bin_reminder_plans enable row level security;
alter table public.bin_reminders enable row level security;

revoke all on public.bin_reminder_plans from anon, authenticated;
revoke all on public.bin_reminders from anon, authenticated;
grant select on public.bin_reminder_plans to authenticated;
grant select on public.bin_reminders to authenticated;

drop policy if exists "Users read their own reminder plans" on public.bin_reminder_plans;
create policy "Users read their own reminder plans" on public.bin_reminder_plans
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users read their own reminders" on public.bin_reminders;
create policy "Users read their own reminders" on public.bin_reminders
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Date rules
-- ---------------------------------------------------------------------------
-- The date of collection number p_n after p_start. Always counted from the
-- start date, so a skipped or missed collection never shifts the schedule.
-- Monthly keeps the day of the month; a shorter month uses its last day
-- (31 Jan -> 28/29 Feb -> 31 Mar).
create or replace function public.td_reminder_due_date(p_start date, p_frequency text, p_n integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_frequency
    when 'weekly'   then p_start + 7 * p_n
    when 'biweekly' then p_start + 14 * p_n
    when 'monthly'  then (p_start + make_interval(months => p_n))::date
  end;
$$;

-- Today in Ghana
create or replace function public.td_today_accra()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Africa/Accra')::date; $$;

-- ---------------------------------------------------------------------------
-- Save a plan after booking a repeat collection
-- ---------------------------------------------------------------------------
create or replace function public.td_create_reminder_plan(
  p_bin_id         uuid,
  p_start_date     date,
  p_preferred_time text default 'morning',
  p_notes          text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- Daily job: remind the day before each collection
-- ---------------------------------------------------------------------------
create or replace function public.td_send_bin_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- What the pop-up and the booking form need
-- ---------------------------------------------------------------------------
-- p_reminder_id null: the user's soonest open reminder for today or later
create or replace function public.td_bin_reminder_details(p_reminder_id uuid default null)
returns table (
  reminder_id     uuid,
  plan_id         uuid,
  due_date        date,
  frequency       text,
  preferred_time  text,
  location_id     uuid,
  location_name   text,
  address         text,
  latitude        double precision,
  longitude       double precision,
  bin_size_liters integer,
  waste_type      text,
  bag_count       integer,
  notes           text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, p.id, r.due_date, p.frequency, p.preferred_time,
         p.location_id, l.location_name, l.address,
         public.st_y(l.coordinates), public.st_x(l.coordinates),
         p.bin_size_liters, p.waste_type, p.bag_count, p.notes
    from public.bin_reminders r
    join public.bin_reminder_plans p on p.id = r.plan_id
    left join public.bin_locations l on l.id = p.location_id
   where r.user_id = auth.uid()
     and r.status = 'pending'
     and p.status = 'active'
     and r.due_date >= public.td_today_accra()
     and (p_reminder_id is null or r.id = p_reminder_id)
   order by r.due_date, r.created_at
   limit 1;
$$;

-- The user's answer: 'booked' (with the new bin), 'skip' or 'stop'
create or replace function public.td_answer_bin_reminder(
  p_reminder_id uuid,
  p_action      text,
  p_bin_id      uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.td_create_reminder_plan(uuid, date, text, text) from public, anon;
revoke all on function public.td_send_bin_reminders() from public, anon, authenticated;
revoke all on function public.td_bin_reminder_details(uuid) from public, anon;
revoke all on function public.td_answer_bin_reminder(uuid, text, uuid) from public, anon;
grant execute on function public.td_create_reminder_plan(uuid, date, text, text) to authenticated;
grant execute on function public.td_bin_reminder_details(uuid) to authenticated;
grant execute on function public.td_answer_bin_reminder(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Schedule: every day at 07:00 Ghana time (Ghana is UTC+0 all year)
-- ---------------------------------------------------------------------------
select cron.unschedule('td-bin-reminders')
 where exists (select 1 from cron.job where jobname = 'td-bin-reminders');
select cron.schedule('td-bin-reminders', '0 7 * * *', 'SELECT public.td_send_bin_reminders()');
