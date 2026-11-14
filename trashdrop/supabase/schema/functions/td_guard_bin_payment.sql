-- Function public.td_guard_bin_payment
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_guard_bin_payment(): execute: service_role
CREATE OR REPLACE FUNCTION public.td_guard_bin_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  is_staff boolean := (me is not null and public.td_can_manage_requests());
  b record;
  cap_subsidy numeric;
  paid numeric;
begin
  -- Who confirmed it: always worked out here, never taken from the caller
  if new.status = 'success' then
    if me is null then
      new.confirmed_by := 'gateway';            -- service key: webhook or server status check
    elsif is_staff then
      new.confirmed_by := case when tg_op = 'UPDATE' and old.confirmed_by = 'gateway' then 'gateway' else 'staff' end;
    elsif tg_op = 'UPDATE' and old.status = 'success' then
      new.confirmed_by := old.confirmed_by;     -- a collector can't upgrade a confirmation
    else
      new.confirmed_by := 'collector';
    end if;
  else
    new.confirmed_by := null;
  end if;

  if me is null or is_staff then
    return new; -- service key (gateway webhook, payout functions) or staff
  end if;

  if tg_op = 'INSERT' then
    select id, collector_id, collector_total_payout, is_promotional, bin_size_liters, fee, is_urgent, deadhead_km
      into b from public.digital_bins where id = new.digital_bin_id;
    if not found or b.collector_id is distinct from me then
      raise exception 'You can only record payments for your own pickups' using errcode = '42501';
    end if;
    if coalesce(new.type, 'collection') <> 'collection' then
      raise exception 'Only collections can be recorded here' using errcode = '42501';
    end if;
    new.type := 'collection';
    new.status := 'pending';
    new.confirmed_by := null;
    new.is_promotional := coalesce(b.is_promotional, false);
    paid := least(coalesce(new.total_bill, 0), coalesce(b.fee, 0));
    if new.is_promotional then
      -- the booked promotional payout; TrashDrop covers the rest (capped by the schedule)
      new.collector_share := greatest(0, least(coalesce(new.collector_share, 0), coalesce(b.collector_total_payout, 0)));
      select platform_subsidy into cap_subsidy from public.promotional_fee_schedule
        where bin_size_liters = b.bin_size_liters and is_active;
      new.platform_subsidy := greatest(0, least(coalesce(new.platform_subsidy, 0), coalesce(cap_subsidy, 0)));
    else
      new.collector_share := least(public.td_bin_collector_share(paid, b.fee, coalesce(b.is_urgent, false), b.deadhead_km),
                                   coalesce(b.collector_total_payout, 0));
      new.platform_share := round(paid - new.collector_share, 2);
      new.platform_subsidy := 0;
    end if;
    return new;
  end if;

  -- UPDATE: status and gateway details only; amounts and links are fixed
  if new.digital_bin_id is distinct from old.digital_bin_id or new.collector_id is distinct from old.collector_id
     or new.type is distinct from old.type or new.payment_mode is distinct from old.payment_mode
     or new.total_bill is distinct from old.total_bill or new.collector_share is distinct from old.collector_share
     or new.platform_share is distinct from old.platform_share or new.platform_subsidy is distinct from old.platform_subsidy
     or new.is_promotional is distinct from old.is_promotional then
    raise exception 'Payment amounts can''t be changed' using errcode = '42501';
  end if;
  if old.status = 'success' and new.status is distinct from old.status then
    raise exception 'A confirmed payment can''t be changed' using errcode = '42501';
  end if;
  if old.status = 'failed' and new.status is distinct from old.status then
    raise exception 'A failed payment can''t be changed' using errcode = '42501';
  end if;
  return new;
end $function$;
