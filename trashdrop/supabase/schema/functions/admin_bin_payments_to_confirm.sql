-- Function public.admin_bin_payments_to_confirm
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- admin_bin_payments_to_confirm(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.admin_bin_payments_to_confirm()
 RETURNS TABLE(id text, digital_bin_id text, bin_status text, collector_name text, payment_mode text, total_bill numeric, collector_share numeric, status text, confirmed_by text, client_momo text, gateway_reference text, gateway_transaction_id text, gateway_error text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_do('payments.confirm') then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
    select bp.id::text, bp.digital_bin_id::text, db.status::text,
           coalesce(nullif(btrim(concat_ws(' ', cp.first_name, cp.last_name)), ''), 'Collector')::text,
           bp.payment_mode, bp.total_bill, bp.collector_share,
           bp.status, bp.confirmed_by,
           case when length(coalesce(bp.client_momo, '')) > 5
                then left(bp.client_momo, 3) || '***' || right(bp.client_momo, 2) else '***' end,
           bp.gateway_reference, bp.gateway_transaction_id, bp.gateway_error,
           bp.created_at, bp.updated_at
      from public.bin_payments bp
      left join public.digital_bins db on db.id = bp.digital_bin_id
      left join public.collector_profiles cp on cp.id = bp.collector_id
     where bp.type = 'collection'
       and bp.payment_mode in ('momo', 'e_cash')
       and (bp.status in ('pending', 'initiated')
            or (bp.status = 'success' and coalesce(bp.confirmed_by, 'collector') = 'collector'))
     order by bp.created_at desc
     limit 200;
end $function$;
