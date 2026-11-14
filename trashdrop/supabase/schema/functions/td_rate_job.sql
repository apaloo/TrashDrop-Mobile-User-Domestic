-- Function public.td_rate_job
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_rate_job(p_source text, p_job_id text, p_stars integer, p_comment text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_rate_job(p_source text, p_job_id text, p_stars integer, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
