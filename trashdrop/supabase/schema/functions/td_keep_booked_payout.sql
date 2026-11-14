-- Function public.td_keep_booked_payout
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_keep_booked_payout(): execute: service_role
CREATE OR REPLACE FUNCTION public.td_keep_booked_payout()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or public.td_can_manage_requests() then return new; end if;
  new.fee := old.fee;  new.is_promotional := old.is_promotional;  new.is_urgent := old.is_urgent;
  new.bag_count := old.bag_count;  new.bin_size_liters := old.bin_size_liters;
  new.collector_core_payout := old.collector_core_payout;  new.collector_urgent_payout := old.collector_urgent_payout;
  new.collector_distance_payout := old.collector_distance_payout;  new.collector_surge_payout := old.collector_surge_payout;
  new.collector_recyclables_payout := old.collector_recyclables_payout;  new.collector_loyalty_cashback := old.collector_loyalty_cashback;
  new.collector_tips := old.collector_tips;  new.collector_total_payout := old.collector_total_payout;
  return new;
end $function$;
