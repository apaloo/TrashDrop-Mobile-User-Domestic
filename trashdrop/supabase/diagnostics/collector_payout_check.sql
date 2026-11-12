-- Collector payout check (read-only). docs/COLLECTOR_PAYOUTS.md.
-- Run in the Supabase SQL editor; for the monthly report (section 5).
-- Every "check" row should say ok. The "distance" rows are figures for the
-- owner: how often a taken bin had no recent collector position, so it paid
-- the 87% default (decided 2026-11-12; revisit with this data).

with taken as (
  select d.id, d.deadhead_km
  from public.digital_bins d
  where d.accepted_at >= now() - interval '30 days'
),
standard_payments as (
  select bp.collector_share,
         least(public.td_bin_collector_share(bp.total_bill, d.fee, coalesce(d.is_urgent, false), d.deadhead_km),
               coalesce(d.collector_total_payout, 0)) as expected
  from public.bin_payments bp
  join public.digital_bins d on d.id = bp.digital_bin_id
  where bp.type = 'collection' and not coalesce(d.is_promotional, false)
    and bp.created_at >= '2026-11-12 12:00:16+00'  -- recorded by the database since 20261112120016
)
select 'distance' as kind, 'bins taken in the last 30 days' as item, count(*)::text as value from taken
union all
select 'distance', 'with a distance recorded', count(*)::text from taken where deadhead_km is not null
union all
select 'distance', 'distance unknown (paid 87%)', count(*)::text from taken where deadhead_km is null
union all
select 'distance', 'share of bins with distance unknown',
       coalesce(round(100.0 * count(*) filter (where deadhead_km is null) / nullif(count(*), 0), 1)::text || '%', 'no bins') from taken
union all
select 'check', 'standard payments matching the payout rule',
       case when count(*) filter (where abs(collector_share - expected) > 0.011) = 0 then 'ok'
            else count(*) filter (where abs(collector_share - expected) > 0.011) || ' differ' end
from standard_payments
union all
select 'check', 'payment records above the booked payout',
       case when count(*) = 0 then 'ok' else count(*) || ' found' end
from public.bin_payments bp join public.digital_bins d on d.id = bp.digital_bin_id
where bp.type = 'collection' and bp.collector_share > coalesce(d.collector_total_payout, 0) + 0.001;
