-- Households rate their collector after a pickup (issue #186; owner's
-- decisions 2026-11-13: collectors see only their average, low ratings alert
-- operations, WhatsApp to follow). Phase A: the database side and in-app
-- rating. The rating is decided by the server, never trusted to the app.
--
-- * job_ratings: one rating per job (pickup request or digital bin), 1-5
--   stars and an optional comment. The household reads its own, staff read
--   all; collectors can't read individual ratings or comments. Nobody writes
--   to the table directly.
-- * td_rate_job(): only the household that booked the job, only once it is
--   done (completed or disposed), only when it has a collector, only once.
--   It then sets the collector's average (collector_profiles.rating).
-- * protect_collector_admin_fields: collector_profiles.rating stays
--   staff-only, except a change made from inside td_rate_job (the same
--   transaction-local flag pattern as app.td_claim).

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

comment on table public.job_ratings is
  'A household''s 1-5 star rating of the collector on one finished job (issue #186). Written only by td_rate_job; collectors see only their average (collector_profiles.rating).';

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
comment on function public.td_rate_job(text, text, integer, text) is
  'A household rates the collector on its own finished pickup or digital bin, once (issue #186). Sets collector_profiles.rating to the collector''s average.';

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
