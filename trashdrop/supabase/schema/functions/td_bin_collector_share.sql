-- Function public.td_bin_collector_share
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_bin_collector_share(p_paid numeric, p_fee numeric, p_urgent boolean, p_km numeric): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_bin_collector_share(p_paid numeric, p_fee numeric, p_urgent boolean, p_km numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  with s as (select greatest(0, least(coalesce(p_paid, 0), coalesce(p_fee, 0)) - 1) as shareable),
  parts as (select case when p_urgent then shareable / 1.30 else shareable end as base,
                   case when p_urgent then shareable - shareable / 1.30 else 0 end as urgent from s)
  select round(base * case when p_km is null or p_km <= 0 then 0.87
                           when p_km <= 2 then 0.85 when p_km <= 5 then 0.87
                           when p_km <= 10 then 0.89 else 0.92 end
               + urgent * 0.75, 2)
  from parts
$function$;
