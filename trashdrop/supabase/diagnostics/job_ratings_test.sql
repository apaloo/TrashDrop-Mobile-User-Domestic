-- Rolled-back test of the job ratings migration (20261113095112_job_ratings.sql; applied 2026-11-13, so the CREATE statements below now replace the live objects inside the rolled-back transaction) (households rate their collector,
-- issue #186). Run the whole file in one go (Supabase SQL editor or
-- execute_sql): it creates the objects, tries each case as real roles, then
-- raises "ROLLED BACK: ..." with the results, so nothing is kept.
-- Uses two disposed digital bins from production (2026-11-13); swap in others
-- if those change.
--
-- Expected (2026-11-13): stars6 refused | others' bin refused | ok:2 |
-- twice refused | direct insert denied | household sees 1 | collector sees 0
-- rows | collector can't set own rating | anon denied | collector avg=2.00 |
-- comment trimmed.

create table if not exists public.job_ratings (
  id uuid primary key default gen_random_uuid(),
  job_source text not null check (job_source in ('pickup_requests', 'digital_bins')),
  job_id text not null,
  household_id uuid not null references auth.users (id) on delete cascade,
  collector_id uuid not null, -- the collector's auth user id
  stars smallint not null check (stars between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (job_source, job_id)
);
create index if not exists job_ratings_collector_idx on public.job_ratings (collector_id);
create index if not exists job_ratings_household_idx on public.job_ratings (household_id);

alter table public.job_ratings enable row level security;
revoke all on public.job_ratings from anon, authenticated;
grant select on public.job_ratings to authenticated;

drop policy if exists job_ratings_read_own on public.job_ratings;
create policy job_ratings_read_own on public.job_ratings
  for select to authenticated using (household_id = auth.uid());
drop policy if exists job_ratings_read_staff on public.job_ratings;
create policy job_ratings_read_staff on public.job_ratings
  for select to authenticated using (public.td_is_staff());
-- No insert, update or delete policies: ratings are written by td_rate_job only


create or replace function public.td_rate_job(p_source text, p_job_id text, p_stars integer, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  v_owner uuid;
  v_collector uuid;
  v_status text;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  r public.job_ratings;
begin
  if me is null then
    raise exception 'Sign in to rate a pickup' using errcode = '42501';
  end if;
  if p_stars is null or p_stars not between 1 and 5 then
    raise exception 'Choose from 1 to 5 stars' using errcode = '22023';
  end if;
  if v_comment is not null and char_length(v_comment) > 500 then
    raise exception 'Keep the comment to 500 characters' using errcode = '22023';
  end if;

  if p_source = 'digital_bins' then
    select d.user_id, d.collector_id, lower(coalesce(d.status, ''))
      into v_owner, v_collector, v_status
      from public.digital_bins d where d.id::text = p_job_id;
  elsif p_source = 'pickup_requests' then
    select p.user_id, p.collector_id, lower(coalesce(p.status, ''))
      into v_owner, v_collector, v_status
      from public.pickup_requests p where p.id::text = p_job_id;
  else
    raise exception 'Unknown kind of pickup' using errcode = '22023';
  end if;

  if not found then
    raise exception 'Pickup not found' using errcode = 'P0002';
  end if;
  if v_owner is distinct from me then
    raise exception 'You can only rate your own pickups' using errcode = '42501';
  end if;
  if v_status not in ('completed', 'disposed') then
    raise exception 'You can rate a pickup once it is done' using errcode = 'P0001';
  end if;
  if v_collector is null then
    raise exception 'This pickup has no collector to rate' using errcode = 'P0001';
  end if;
  if v_collector = me then
    raise exception 'You can''t rate yourself' using errcode = '42501';
  end if;

  insert into public.job_ratings (job_source, job_id, household_id, collector_id, stars, comment)
  values (p_source, p_job_id, me, v_collector, p_stars, v_comment)
  on conflict (job_source, job_id) do nothing
  returning * into r;
  if r.id is null then
    raise exception 'You have already rated this pickup' using errcode = '23505';
  end if;

  -- The collector's average, from all their ratings (staff-only column)
  perform set_config('td.rating_sync', 'on', true);
  update public.collector_profiles cp
     set rating = (select round(avg(j.stars)::numeric, 2) from public.job_ratings j where j.collector_id = v_collector)
   where cp.user_id = v_collector;
  perform set_config('td.rating_sync', '', true);

  return jsonb_build_object('id', r.id, 'job_source', r.job_source, 'job_id', r.job_id, 'stars', r.stars, 'created_at', r.created_at);
end
$$;

revoke all on function public.td_rate_job(text, text, integer, text) from public, anon;
grant execute on function public.td_rate_job(text, text, integer, text) to authenticated;

-- collector_profiles.rating stays staff-only, except from inside td_rate_job
create or replace function public.protect_collector_admin_fields()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
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

do $t$
declare
  bin1 text := '2f4e8642-dede-4f38-94e2-f0ea90d23bac'; hh1 uuid := '810809ea-9444-4980-a2f2-024f2deadfb0'; col1 uuid := '23ac6952-c55e-4614-8f23-3caaf373fed7';
  bin2 text := 'aa0a58dd-d49c-4a2a-b421-2ce266de6a7a'; hh2 uuid := 'a9f9ec3b-3abc-475a-86d4-df3bab6e11cc';
  pend text; out text := ''; res jsonb; n int;
  procedure_as text;
begin
  select id::text into pend from digital_bins where status='pending' and user_id = hh1 limit 1;

  -- act as household 1
  perform set_config('request.jwt.claims', json_build_object('sub', hh1, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin perform td_rate_job('digital_bins', bin1, 6, null); out := out || 'stars6:ALLOWED '; exception when others then out := out || 'stars6:' || sqlerrm || ' | '; end;
  begin perform td_rate_job('digital_bins', bin2, 5, null); out := out || 'others:ALLOWED '; exception when others then out := out || 'others:' || sqlerrm || ' | '; end;
  if pend is not null then
    begin perform td_rate_job('digital_bins', pend, 5, null); out := out || 'pending:ALLOWED '; exception when others then out := out || 'pending:' || sqlerrm || ' | '; end;
  end if;
  res := td_rate_job('digital_bins', bin1, 2, '  Late and rude  ');
  out := out || 'ok:' || (res->>'stars') || ' | ';
  begin perform td_rate_job('digital_bins', bin1, 5, null); out := out || 'twice:ALLOWED '; exception when others then out := out || 'twice:' || sqlerrm || ' | '; end;
  begin insert into job_ratings(job_source, job_id, household_id, collector_id, stars) values ('digital_bins', bin2, hh1, col1, 5); out := out || 'direct-insert:ALLOWED '; exception when others then out := out || 'direct-insert:' || sqlerrm || ' | '; end;
  select count(*) into n from job_ratings; out := out || 'hh1 sees ' || n || ' | ';

  -- act as the collector: cannot read ratings, cannot change own rating
  perform set_config('request.jwt.claims', json_build_object('sub', col1, 'role', 'authenticated')::text, true);
  select count(*) into n from job_ratings; out := out || 'collector sees ' || n || ' rows | ';
  begin update collector_profiles set rating = 5 where user_id = col1; out := out || 'collector-self-rate:ALLOWED '; exception when others then out := out || 'collector-self-rate:' || sqlerrm || ' | '; end;

  -- anonymous
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin perform td_rate_job('digital_bins', bin1, 5, null); out := out || 'anon:ALLOWED '; exception when others then out := out || 'anon:' || sqlerrm || ' | '; end;
  reset role;

  select rating::text into procedure_as from collector_profiles where user_id = col1;
  out := out || 'collector avg=' || coalesce(procedure_as, 'null') || ' | stored comment=' || (select comment from job_ratings limit 1);
  raise exception 'ROLLED BACK: %', out;
end $t$;
