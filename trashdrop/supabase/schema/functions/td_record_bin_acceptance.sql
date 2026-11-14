-- Function public.td_record_bin_acceptance
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_record_bin_acceptance(): execute: service_role
CREATE OR REPLACE FUNCTION public.td_record_bin_acceptance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare km numeric;
begin
  if new.collector_id is not null and new.collector_id is distinct from old.collector_id then
    new.accepted_at := now();
    select round((st_distancesphere(cp.current_location, l.coordinates) / 1000.0)::numeric, 2) into km
      from public.collector_profiles cp, public.bin_locations l
     where cp.user_id = new.collector_id and l.id = new.location_id
       and cp.current_location is not null and l.coordinates is not null
       and cp.location_updated_at > now() - interval '15 minutes'
     order by cp.location_updated_at desc limit 1;
    new.deadhead_km := km;
  elsif auth.uid() is not null and not public.td_can_manage_requests() then
    new.deadhead_km := old.deadhead_km;
    new.accepted_at := old.accepted_at;
  end if;
  return new;
end $function$;
