-- Function public.admin_confirm_bin_payment
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- admin_confirm_bin_payment(p_id text, p_decision text, p_note text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.admin_confirm_bin_payment(p_id text, p_decision text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  before_row jsonb;
  done jsonb;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.can_do('payments.confirm') then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_decision not in ('confirm', 'fail') then
    raise exception 'Choose confirm or fail';
  end if;
  if note is null then
    raise exception 'Say what you checked in TrendiPay';
  end if;

  select jsonb_build_object('status', bp.status, 'confirmed_by', bp.confirmed_by) into before_row
    from public.bin_payments bp
   where bp.id::text = p_id and bp.type = 'collection' and bp.payment_mode in ('momo', 'e_cash')
     and (bp.status in ('pending', 'initiated')
          or (bp.status = 'success' and coalesce(bp.confirmed_by, 'collector') = 'collector'))
   for update;
  if before_row is null then
    raise exception 'This payment was already confirmed or failed, or no longer exists';
  end if;

  -- td_guard_bin_payment records confirmed_by = 'staff' for an admin
  update public.bin_payments bp
     set status = case when p_decision = 'confirm' then 'success' else 'failed' end,
         gateway_error = case when p_decision = 'fail' then left('Checked by an admin: ' || note, 500) else bp.gateway_error end,
         updated_at = now()
   where bp.id::text = p_id
  returning jsonb_build_object('id', bp.id::text, 'digital_bin_id', bp.digital_bin_id::text, 'status', bp.status,
                               'confirmed_by', bp.confirmed_by, 'total_bill', bp.total_bill) into done;

  perform public.td_write_log('info', 'admin',
    case when p_decision = 'confirm' then 'payment.confirmed' else 'payment.failed' end,
    'bin_payment', p_id,
    case when p_decision = 'confirm'
         then format('MoMo payment of GHS %s confirmed by an admin: %s', done ->> 'total_bill', note)
         else format('MoMo payment of GHS %s marked failed by an admin: %s', done ->> 'total_bill', note) end,
    before_row, done);
  return done;
end $function$;
